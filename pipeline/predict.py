"""Next-match forecasts, and the backtests that say how far to trust them.

Three forecasts, each for the next match only:

  result       home / draw / away probabilities from team attack and defence
               strengths (Poisson goals with home advantage and the
               Dixon-Coles low-score correction)
  line-up      who starts, from recency-weighted starts and availability
  tendencies   possession, shots, xG and corners expected in the match

Every setting is chosen on the season before the current one (the tuning
season) and then scored, untouched, on the current season, always beside
simple baselines. Forecasts for a match only ever use matches played before it.
"""
from __future__ import annotations

import itertools
import math

import duckdb
import numpy as np
import pandas as pd

from .config import DB_PATH

MAX_GOALS = 8
PROMOTED_MIN_MATCHES = 10  # fewer top-flight matches than this in the window = newcomer


# --------------------------------------------------------------------------- result model
def fit_strengths(hist: pd.DataFrame, asof: pd.Timestamp, half_life: float, xg_w: float,
                  k: float, newcomer: float) -> dict:
    """Weighted Poisson fit of attack/defence strengths by iterative scaling.

    hist: finished matches before `asof` with home_id, away_id, kickoff, hg, ag
    (goals) and hxg, axg (NaN where no shot data). `k` pseudo-matches pull each
    team toward its prior (league average; `newcomer` for teams with little history).
    """
    age = (asof - hist["kickoff"]).dt.total_seconds().to_numpy() / 86400.0
    w = 0.5 ** (age / half_life)
    hg, ag = hist["hg"].to_numpy(float), hist["ag"].to_numpy(float)
    hxg, axg = hist["hxg"].to_numpy(float), hist["axg"].to_numpy(float)
    has = ~np.isnan(hxg)
    hy = np.where(has, (1 - xg_w) * hg + xg_w * np.nan_to_num(hxg), hg)
    ay = np.where(has, (1 - xg_w) * ag + xg_w * np.nan_to_num(axg), ag)
    teams = sorted(set(hist["home_id"]) | set(hist["away_id"]))
    idx = {t: i for i, t in enumerate(teams)}
    h = hist["home_id"].map(idx).to_numpy()
    a = hist["away_id"].map(idx).to_numpy()
    n = len(teams)
    played = np.bincount(h, minlength=n) + np.bincount(a, minlength=n)
    prior_att = np.where(played < PROMOTED_MIN_MATCHES, newcomer, 1.0)
    prior_def = np.where(played < PROMOTED_MIN_MATCHES, 2 - newcomer, 1.0)
    sw = w.sum()
    mu = (w * ay).sum() / sw                      # away goals per match
    home_adv = (w * hy).sum() / max((w * ay).sum(), 1e-9)
    att, dfn = np.ones(n), np.ones(n)
    for _ in range(60):
        # goals scored by team i, and the model's expectation with att_i = 1
        num = np.bincount(h, w * hy, n) + np.bincount(a, w * ay, n)
        den = np.bincount(h, w * mu * home_adv * dfn[a], n) + np.bincount(a, w * mu * dfn[h], n)
        att = (num + k * mu * prior_att) / (den + k * mu)
        num = np.bincount(h, w * ay, n) + np.bincount(a, w * hy, n)
        den = np.bincount(h, w * mu * att[a], n) + np.bincount(a, w * mu * home_adv * att[h], n)
        dfn = (num + k * mu * prior_def) / (den + k * mu)
    return {"mu": mu, "home_adv": home_adv, "att": dict(zip(teams, att)), "def": dict(zip(teams, dfn)),
            "newcomer": newcomer}


def expected_goals(model: dict, home: int, away: int) -> tuple[float, float]:
    nc = model["newcomer"]
    att = lambda t: model["att"].get(t, nc)          # noqa: E731
    dfn = lambda t: model["def"].get(t, 2 - nc)      # noqa: E731
    return (model["mu"] * model["home_adv"] * att(home) * dfn(away), model["mu"] * att(away) * dfn(home))


def score_matrix(lh: float, la: float, rho: float) -> np.ndarray:
    g = np.arange(MAX_GOALS + 1)
    fact = np.array([math.factorial(int(i)) for i in g], float)
    ph = np.exp(-lh) * lh ** g / fact
    pa = np.exp(-la) * la ** g / fact
    m = np.outer(ph, pa)
    # Dixon-Coles: low scores are not independent
    m[0, 0] *= 1 - lh * la * rho
    m[0, 1] *= 1 + lh * rho
    m[1, 0] *= 1 + la * rho
    m[1, 1] *= 1 - rho
    m = np.clip(m, 0, None)
    return m / m.sum()


def outcome_probs(m: np.ndarray) -> tuple[float, float, float]:
    return float(np.tril(m, -1).sum()), float(np.trace(m)), float(np.triu(m, 1).sum())


def _score(probs: np.ndarray, outcome: np.ndarray) -> dict:
    """probs: n x 3 (home, draw, away); outcome: 0/1/2."""
    p = np.clip(probs[np.arange(len(outcome)), outcome], 1e-9, 1)
    onehot = np.eye(3)[outcome]
    cum = np.cumsum(probs, 1)[:, :2] - np.cumsum(onehot, 1)[:, :2]
    return {
        "n": int(len(outcome)),
        "logLoss": float(-np.log(p).mean()),
        "rps": float((cum ** 2).sum(1).mean() / 2),
        "accuracy": float((probs.argmax(1) == outcome).mean()),
    }


def walk_forward(all_matches: pd.DataFrame, season: int, params: dict, window_years: float = 4) -> pd.DataFrame:
    """Predict every match of `season`, refitting before each match day."""
    done = all_matches[all_matches.status == "finished"]
    target = done[done.season == season].copy()
    target["day"] = target["kickoff"].dt.normalize()
    rows = []
    for day, grp in target.groupby("day"):
        hist = done[(done.kickoff < day) & (done.kickoff > day - pd.Timedelta(days=365 * window_years))]
        if params.get("season_only"):
            hist = hist[hist.season == season]
        if len(hist) < 8:
            model = None
        else:
            model = fit_strengths(hist, day, params["half_life"], params["xg_w"], params["k"], params["newcomer"])
        for m in grp.itertuples():
            if model is None:
                lh, la = 1.55, 1.25
            else:
                lh, la = expected_goals(model, m.home_id, m.away_id)
            p = outcome_probs(score_matrix(lh, la, params["rho"]))
            rows.append({"event_id": m.event_id, "p_home": p[0], "p_draw": p[1], "p_away": p[2], "lh": lh, "la": la,
                         "outcome": 0 if m.hg > m.ag else 1 if m.hg == m.ag else 2})
    return pd.DataFrame(rows)


RESULT_GRID = {
    "half_life": [180, 365, 730],
    "xg_w": [0.0, 0.5, 0.8],
    "k": [3, 8],
    "newcomer": [1.0, 0.85],
}
RHO_GRID = [0.0, -0.06, -0.12]
SEASON_ONLY = {"half_life": 10_000, "xg_w": 0.0, "k": 1, "newcomer": 1.0, "rho": 0.0, "season_only": True}


def backtest_result(matches: pd.DataFrame, odds: pd.DataFrame, tune: int, test: int) -> tuple[dict, dict]:
    best, best_ll = None, 9.0
    for combo in itertools.product(*RESULT_GRID.values()):
        params = dict(zip(RESULT_GRID.keys(), combo)) | {"rho": 0.0}
        wf = walk_forward(matches, tune, params)
        y = wf["outcome"].to_numpy()
        for rho in RHO_GRID:  # the correction does not change the fit, only the score matrix
            probs = np.array([outcome_probs(score_matrix(a, b, rho)) for a, b in zip(wf.lh, wf.la)])
            ll = _score(probs, y)["logLoss"]
            if ll < best_ll:
                best, best_ll = params | {"rho": rho}, ll
    done = matches[matches.status == "finished"]
    prior = done[done.season < test]
    base = np.array([(prior.hg > prior.ag).mean(), (prior.hg == prior.ag).mean(), (prior.hg < prior.ag).mean()])

    out = {"tuneSeason": tune, "testSeason": test, "params": best, "tuneLogLoss": best_ll, "rows": []}
    wf = walk_forward(matches, test, best)
    so = walk_forward(matches, test, SEASON_ONLY)
    y = wf["outcome"].to_numpy()
    probs = wf[["p_home", "p_draw", "p_away"]].to_numpy()
    out["rows"].append({"name": "This app's model", "kind": "model", **_score(probs, y)})
    out["rows"].append({"name": "This season's goals only (no history, no xG)", "kind": "baseline",
                        **_score(so[["p_home", "p_draw", "p_away"]].to_numpy(), so["outcome"].to_numpy())})
    out["rows"].append({"name": "Same for every match (historical home/draw/away rates)", "kind": "baseline",
                        **_score(np.tile(base, (len(y), 1)), y)})
    # bookmakers, on the matches that have odds; the model on the same matches
    o = wf.merge(odds, on="event_id")
    if len(o):
        inv = 1 / o[["home_win", "draw", "away_win"]].to_numpy()
        bk = inv / inv.sum(1, keepdims=True)
        yo = o["outcome"].to_numpy()
        out["oddsSubset"] = [
            {"name": "Bookmaker odds (margin removed)", "kind": "reference", **_score(bk, yo)},
            {"name": "This app's model, same matches", "kind": "model",
             **_score(o[["p_home", "p_draw", "p_away"]].to_numpy(), yo)},
        ]
    # calibration of the model's home-win probability
    bins = pd.cut(wf["p_home"], [0, 0.3, 0.4, 0.5, 0.6, 1.0])
    out["calibration"] = [
        {"bin": str(b), "n": int(len(g)), "predicted": float(g.p_home.mean()), "actual": float((g.outcome == 0).mean())}
        for b, g in wf.groupby(bins, observed=True)
    ]
    return out, best


# --------------------------------------------------------------------------- line-ups
def lineup_scores(prev: pd.DataFrame, half_life: float) -> pd.Series:
    """prev: the team's earlier player rows with `ago` (1 = last match). Recency-weighted start rate."""
    w = 0.5 ** ((prev["ago"] - 1) / half_life)
    total = w.groupby(prev["event_id"]).first().sum()
    return (w * prev["started"]).groupby(prev["player_id"]).sum() / total


def backtest_lineups(pm: pd.DataFrame, unavailable: pd.DataFrame, tune: int, test: int) -> tuple[dict, float]:
    out_set = set(zip(unavailable.event_id, unavailable.player_id))

    def run(season: int, half_life: float, use_avail: bool) -> dict:
        hits = {"model": [], "last": [], "season": []}
        s = pm[pm.season == season]
        for team, tp in s.groupby("team_id"):
            events = tp.drop_duplicates("event_id").sort_values("kickoff")["event_id"].tolist()
            for i, ev in enumerate(events):
                if i < 3:
                    continue
                actual = set(tp[(tp.event_id == ev) & tp.started].player_id)
                order = {e: i - j for j, e in enumerate(events[:i])}
                prev = tp[tp.event_id.isin(order)].assign(ago=lambda d: d.event_id.map(order))
                sc = lineup_scores(prev, half_life)
                if use_avail:
                    sc = sc[[p for p in sc.index if (ev, p) not in out_set]]
                hits["model"].append(len(actual & set(sc.nlargest(11).index)))
                hits["last"].append(len(actual & set(prev[(prev.ago == 1) & prev.started].player_id)))
                hits["season"].append(len(actual & set(prev[prev.started].groupby("player_id").size().nlargest(11).index)))
        return {k: float(np.mean(v)) for k, v in hits.items()} | {"n": len(hits["model"])}

    grid = [1, 2, 3, 5, 8]
    tuned = {hl: run(tune, hl, False)["model"] for hl in grid}
    best = max(tuned, key=tuned.get)
    plain, avail = run(test, best, False), run(test, best, True)
    return {
        "tuneSeason": tune, "testSeason": test, "halfLife": best, "n": plain["n"],
        "rows": [
            {"name": "This app: recent starts + who is unavailable", "kind": "model", "correct": avail["model"]},
            {"name": "This app without availability", "kind": "model", "correct": plain["model"]},
            {"name": "Same eleven as the last match", "kind": "baseline", "correct": plain["last"]},
            {"name": "Most starts this season", "kind": "baseline", "correct": plain["season"]},
        ],
    }, best


# --------------------------------------------------------------------------- tendencies
TENDENCIES = {"possession": "Possession (%)", "shots": "Shots", "xg": "xG", "corners": "Corners"}


def _rate(values: np.ndarray, half_life: float, k: float, league: float) -> float:
    """Recency-weighted mean of earlier matches (most recent last), shrunk to the league."""
    values = values[~np.isnan(values)]
    if len(values) == 0:
        return league
    w = 0.5 ** (np.arange(len(values))[::-1] / half_life)
    return float(((w * values).sum() + k * league) / (w.sum() + k))


def predict_tendency(tm: pd.DataFrame, metric: str, team: int, opp: int, before, half_life: float, k: float,
                     league: float) -> float:
    mine = tm[(tm.team_id == team) & (tm.kickoff < before)].sort_values("kickoff")
    theirs = tm[(tm.team_id == opp) & (tm.kickoff < before)].sort_values("kickoff")
    f = _rate(mine[metric].to_numpy(float), half_life, k, league)
    a = _rate(theirs[f"{metric}_a"].to_numpy(float), half_life, k, league)
    if metric == "possession":
        return float(np.clip(league + (f - league) + (a - league), 20, 80))
    return f * a / league


def backtest_tendencies(tm: pd.DataFrame, tune: int, test: int) -> tuple[dict, dict]:
    def run(season: int, metric: str, half_life: float, k: float) -> dict:
        s = tm[tm.season == season].sort_values("kickoff")
        err = {"model": [], "team": [], "league": []}
        for r in s.itertuples():
            earlier = s[s.kickoff < r.kickoff]
            mine = earlier[earlier.team_id == r.team_id]
            if len(mine) < 3 or (earlier.team_id == r.opp_id).sum() < 3:
                continue
            league = float(earlier[metric].mean())
            actual = getattr(r, metric)
            if not league > 0 or actual is None or np.isnan(actual) or mine[metric].notna().sum() < 3:
                continue
            err["model"].append(abs(predict_tendency(earlier, metric, r.team_id, r.opp_id, r.kickoff, half_life, k, league) - actual))
            err["team"].append(abs(mine[metric].mean() - actual))
            err["league"].append(abs(league - actual))
        return {a: float(np.mean(b)) for a, b in err.items()} | {"n": len(err["model"])}

    rows, params = [], {}
    for metric, label in TENDENCIES.items():
        grid = list(itertools.product([3, 6, 12, 40], [1, 3, 6]))
        scores = {g: run(tune, metric, *g)["model"] for g in grid}
        hl, k = min(scores, key=scores.get)
        params[metric] = {"half_life": hl, "k": k}
        t = run(test, metric, hl, k)
        rows.append({"metric": metric, "label": label, "n": t["n"], "model": t["model"],
                     "teamAverage": t["team"], "leagueAverage": t["league"], "halfLife": hl, "k": k})
    return {"tuneSeason": tune, "testSeason": test, "rows": rows}, params


# --------------------------------------------------------------------------- run
def load() -> dict:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    season = con.execute("SELECT season FROM build_info").fetchone()[0]
    matches = con.execute("""
        SELECT m.*, m.home_goals AS hg, m.away_goals AS ag, h.xg AS hxg, a.xg AS axg
        FROM matches m
        LEFT JOIN team_match h ON h.event_id = m.event_id AND h.team_id = m.home_id
        LEFT JOIN team_match a ON a.event_id = m.event_id AND a.team_id = m.away_id
        ORDER BY kickoff
    """).df()
    d = {
        "season": season, "matches": matches,
        "tm": con.execute("SELECT * FROM team_match ORDER BY kickoff").df(),
        "pm": con.execute("SELECT * FROM player_match ORDER BY kickoff").df(),
        "unavailable": con.execute("SELECT * FROM unavailable").df(),
    }
    con.close()
    return d


def run(odds: pd.DataFrame) -> dict:
    """Backtest everything, then return the tuned settings and fitted pieces for the export."""
    d = load()
    test, tune = d["season"], d["season"] - 1
    result_bt, result_params = backtest_result(d["matches"], odds, tune, test)
    lineup_bt, lineup_hl = backtest_lineups(d["pm"], d["unavailable"], tune, test)
    tend_bt, tend_params = backtest_tendencies(d["tm"], tune, test)
    done = d["matches"][d["matches"].status == "finished"]
    now = done["kickoff"].max() + pd.Timedelta(days=1)
    model = fit_strengths(done[done.kickoff > now - pd.Timedelta(days=365 * 4)], now, result_params["half_life"],
                          result_params["xg_w"], result_params["k"], result_params["newcomer"])
    return {
        **d, "model": model, "rho": result_params["rho"], "lineup_half_life": lineup_hl,
        "tendency_params": tend_params,
        "backtest": {"result": result_bt, "lineups": lineup_bt, "tendencies": tend_bt},
    }


def api_cache_glob(resource: str):
    """Cached per-match files of one kind (e.g. "odds")."""
    from .config import RAW
    return sorted(RAW.glob(f"events_*_{resource}.json"))

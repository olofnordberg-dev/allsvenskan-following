"""Write the small JSON files the site is built from (web/data)."""
from __future__ import annotations

import json
import math
import re
import shutil
import unicodedata

import duckdb
import numpy as np
import pandas as pd

from . import impact, predict, trends
from .build import SET_PIECE, cached, cached_all
from .config import DB_PATH, LEAGUE_ID, RECENT_MATCHES, WEB_DATA
from .metrics import METRICS, TREND_METRICS

DEFAULT_TEAM_ID = 436  # Djurgårdens IF
IMG = "https://sports.bzzoiro.com/img/team/{id}/?bg=transparent"
# Fallback badge colours, used only if a logo fails to load.
COLORS = {
    436: "#1b6fb5", 449: "#16181d", 438: "#0a7a3d", 135: "#5aa9dd", 439: "#1f4e9c", 407: "#1d1d1b",
    440: "#c9a200", 447: "#0b57a4", 441: "#b89b00", 1053: "#c8232c", 442: "#1a4fa0", 443: "#b3202a",
    448: "#17643a", 437: "#a8232b", 1054: "#1c7a3e", 450: "#b22234",
}
LOG_STATS = ["goals", "goals_a", "xg", "xg_a", "shots", "shots_a", "sot", "big_chances", "touches_box",
             "possession", "pass_acc", "corners", "sp_xg", "sp_xg_a", "pressing", "long_ball_share", "fouls"]
MIRROR = {"lead": "trail", "level": "level", "trail": "lead"}
BANDS = [(0, 15), (15, 30), (30, 45), (45, 60), (60, 75), (75, 200)]


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def code(short: str) -> str:
    s = unicodedata.normalize("NFKD", short).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z]", "", s)
    return s.upper() if len(s) <= 4 else s[:3].upper()


def clean(o):
    """Round floats and turn NaN/NumPy types into plain JSON values."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if math.isnan(o) or math.isinf(o) else round(float(o), 4)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if o is pd.NaT or o is pd.NA:
        return None
    if isinstance(o, pd.Timestamp):
        return o.isoformat()
    return o


def write(path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), ensure_ascii=False, separators=(",", ":")))


def load_odds() -> pd.DataFrame:
    rows = []
    for f in predict.api_cache_glob("odds"):
        o = json.loads(f.read_text())
        od = o.get("odds") or {}
        if od.get("home_win") and od.get("draw") and od.get("away_win"):
            rows.append({"event_id": o["event_id"], "home_win": od["home_win"], "draw": od["draw"],
                         "away_win": od["away_win"], "updated": o.get("last_update_at")})
    return pd.DataFrame(rows, columns=["event_id", "home_win", "draw", "away_win", "updated"])


def per_match_sql() -> str:
    cols = ", ".join(
        f"CAST({m.num} AS DOUBLE) / nullif({m.den}, 0) AS {m.key}" for m in METRICS if m.key in set(LOG_STATS + TREND_METRICS)
    )
    return f"SELECT event_id, team_id, {cols} FROM cur"


def zone(x: float, y: float) -> str:
    in_width = 20.5 <= y <= 79.5
    if x <= 5.5 and 36.5 <= y <= 63.5:
        return "six"
    if x <= 16.5 and in_width:
        return "box"
    return "out"


def shot_groups(df: pd.DataFrame) -> dict:
    out = {}
    df = df.assign(
        group=np.select(
            [df.situation == "penalty", df.situation.isin(SET_PIECE), df.situation == "fast-break"],
            ["penalty", "set_piece", "fast_break"], "open_play"),
        zone=[zone(x, y) for x, y in zip(df.x, df.y)],
        band=[next(i for i, (a, b) in enumerate(BANDS) if a < max(m, 1) <= b) for m in df.minute],
    )
    for key in ("group", "zone", "situation", "body", "band"):
        g = df.groupby(key).agg(shots=("xg", "size"), xg=("xg", "sum"), goals=("is_goal", "sum"))
        out[key] = {str(k): [int(r.shots), round(float(r.xg), 2), int(r.goals)] for k, r in g.iterrows()}
    return out


def main() -> None:
    odds = load_odds()
    P = predict.run(odds)
    season, tm, pm, matches = P["season"], P["tm"], P["pm"], P["matches"]
    con = duckdb.connect(str(DB_PATH), read_only=True)
    info = con.execute("SELECT * FROM build_info").df().iloc[0]
    metrics = con.execute("SELECT * FROM team_metrics").df()
    per_match = con.execute(per_match_sql()).df()
    shots = con.execute(f"SELECT * FROM shots WHERE season = {season}").df()
    con.close()

    cur = tm[tm.season == season]
    cur_matches = matches[matches.season == season].sort_values("kickoff")
    api_teams = {t["id"]: t for t in cached_all("/teams/", {"league_id": LEAGUE_ID, "season_id": int(info.season_id)})}
    team_ids = sorted(set(cur_matches.home_id) | set(cur_matches.away_id))
    standings = {r["team_id"]: r for r in cached(f"/leagues/{LEAGUE_ID}/standings/", {"season_id": int(info.season_id)}).get("standings", [])}
    managers = {m.get("current_team_id"): m for m in cached_all("/managers/", {"league_id": LEAGUE_ID})}

    T = {}
    for tid in team_ids:
        a = api_teams.get(tid, {})
        name = a.get("name") or tm[tm.team_id == tid]["team_id"].astype(str).iloc[0]
        short = a.get("short_name") or name
        T[tid] = {"id": tid, "slug": slugify(short), "name": name, "short": short, "code": code(short),
                  "logo": IMG.format(id=tid), "color": COLORS.get(tid, "#5b6577")}
    slug = {tid: t["slug"] for tid, t in T.items()}

    # ---- league table, computed from the matches so it always agrees with the rest of the site
    table = []
    for tid in team_ids:
        t = cur[cur.team_id == tid].sort_values("kickoff")
        st = standings.get(tid, {})
        table.append({
            "team": slug[tid], "played": len(t), "w": int(t.win.sum()), "d": int(t.draw.sum()), "l": int(t.loss.sum()),
            "gf": int(t.goals.sum()), "ga": int(t.goals_a.sum()), "pts": int(t.points.sum()),
            "xgf": float(t.xg.sum()), "xga": float(t.xg_a.sum()),
            "form": "".join("W" if p == 3 else "D" if p == 1 else "L" for p in t.points.tail(5)),
            "zone": (st.get("zone") or {}).get("label"), "zoneType": (st.get("zone") or {}).get("type"),
        })
    table.sort(key=lambda r: (-r["pts"], -(r["gf"] - r["ga"]), -r["gf"]))
    for i, r in enumerate(table):
        r["pos"] = i + 1
    pos = {r["team"]: r["pos"] for r in table}

    league_avg = {g: {r.metric: r.league_avg for r in d.drop_duplicates("metric").itertuples()}
                  for g, d in metrics.groupby("grouping")}
    all_groups = shot_groups(shots)
    n_team_matches = len(cur)

    # ---- forecasts for every match not yet played
    model, rho = P["model"], P["rho"]
    upcoming = cur_matches[cur_matches.status != "finished"]
    future = pd.Timestamp("2100-01-01", tz="UTC")
    squads = {tid: cached(f"/teams/{tid}/squad/").get("players", []) for tid in team_ids}

    def build_players(tid: int) -> list[dict]:
        """Every player with minutes this season, with usage, output and impact."""
        t = cur[cur.team_id == tid].sort_values("kickoff")
        tp = pm[(pm.team_id == tid) & (pm.season == season)]
        events = t.event_id.tolist()
        last5 = set(events[-RECENT_MATCHES:])
        avail = {p["id"]: p for p in squads[tid]}
        team_shots, team_xg = max(tp.shots.sum(), 1), max(tp.npxg.sum(), 0.01)
        players = []
        for pid, g in tp.groupby("player_id"):
            if g.minutes.sum() == 0:
                continue
            by_event = g.set_index("event_id")
            a = avail.get(pid)
            last = g.sort_values("kickoff").iloc[-1]
            players.append({
                "id": int(pid), "name": last["name"], "position": (a or {}).get("position") or last["position"],
                "apps": int((g.minutes > 0).sum()), "starts": int(g.started.sum()), "minutes": int(g.minutes.sum()),
                # stoppage time can push a match past 90 minutes; a share is capped at the full match
                "minShare": float(g.minutes.clip(upper=90).sum() / (90 * len(events))),
                "minShareLast5": float(g[g.event_id.isin(last5)].minutes.clip(upper=90).sum() / (90 * len(last5))),
                "goals": int(g.goals.sum()), "assists": int(g.assists.sum()), "shots": int(g.shots.sum()),
                "npxg": float(g.npxg.sum()), "keyPasses": int(g.key_passes.sum()),
                "shotShare": float(g.shots.sum() / team_shots), "xgShare": float(g.npxg.sum() / team_xg),
                "rating": float(g.rating.mean()) if g.rating.notna().any() else None,
                "yellow": int(g.yellow.sum()), "red": int(g.red.sum()),
                "inSquad": a is not None, "availability": (a or {}).get("availability"),
                "injury": (a or {}).get("injury_type") or None, "expectedReturn": (a or {}).get("injury_expected_return"),
                "matchMinutes": [min(int(by_event.minutes.get(e, 0)), 90) if e in by_event.index else None for e in events],
                "matchStarts": [bool(by_event.started.get(e, False)) if e in by_event.index else False for e in events],
            })
        players.sort(key=lambda p: -p["minutes"])
        impact.add_impact(players)
        return players

    team_players = {tid: build_players(tid) for tid in team_ids}
    impact_of = {tid: {p["id"]: p for p in ps} for tid, ps in team_players.items()}

    def lineup_forecast(tid: int) -> dict:
        tp = pm[(pm.team_id == tid) & (pm.season == season)]
        events = tp.drop_duplicates("event_id").sort_values("kickoff")["event_id"].tolist()
        order = {e: len(events) - j for j, e in enumerate(events)}
        prev = tp.assign(ago=tp.event_id.map(order))
        sc = predict.lineup_scores(prev, P["lineup_half_life"])
        w = 0.5 ** ((prev.ago - 1) / 3)
        exp_min = (w * prev.minutes).groupby(prev.player_id).sum() / w.groupby(prev.event_id).first().sum()
        out_now = {p["id"]: p for p in squads[tid] if p.get("availability") not in ("available", None, "")}
        in_squad = {p["id"] for p in squads[tid]}
        names = tp.drop_duplicates("player_id", keep="last").set_index("player_id")
        ranked = [p for p in sc.sort_values(ascending=False).index
                  if p not in out_now and (not in_squad or p in in_squad)]
        row = lambda p, i: {"id": int(p), "name": names.loc[p, "name"], "position": names.loc[p, "position"],  # noqa: E731
                            "startScore": float(sc[p]), "expMinutes": float(exp_min.get(p, 0)), "inEleven": i < 11}

        def absent(p: dict) -> dict:
            info = impact_of[tid].get(p["id"])
            return {
                "id": p["id"], "name": p["name"], "position": p.get("position") or (info or {}).get("position") or "",
                "status": p.get("availability"), "reason": p.get("injury_type") or None,
                "expectedReturn": p.get("injury_expected_return"), "startScore": float(sc.get(p["id"], 0)),
                # a player with no minutes this season has no impact to lose
                "impact": info["impact"] if info else 0.0, "impactRank": info["impactRank"] if info else None,
                "tier": info["tier"] if info else "fringe", "minShare": info["minShare"] if info else 0.0,
                "goals": info["goals"] if info else 0, "assists": info["assists"] if info else 0,
                "npxg": info["npxg"] if info else 0.0, "rating": info["rating"] if info else None,
            }

        unavailable = sorted((absent(p) for p in out_now.values()), key=lambda u: -u["impact"])
        return {
            "players": [row(p, i) for i, p in enumerate(ranked[:18]) if sc[p] > 0.02 or i < 11],
            "unavailable": unavailable,
            "absence": impact.absence_weight(team_players[tid], set(out_now)),
        }

    forecasts = {}
    for m in upcoming.itertuples():
        lh, la = predict.expected_goals(model, m.home_id, m.away_id)
        sm = predict.score_matrix(lh, la, rho)
        ph, pd_, pa = predict.outcome_probs(sm)
        top = sorted(((float(sm[i, j]), i, j) for i in range(6) for j in range(6)), reverse=True)[:6]
        tend = {}
        for metric, prm in P["tendency_params"].items():
            league = float(cur[metric].mean())
            tend[metric] = {
                "home": predict.predict_tendency(cur, metric, m.home_id, m.away_id, future, prm["half_life"], prm["k"], league),
                "away": predict.predict_tendency(cur, metric, m.away_id, m.home_id, future, prm["half_life"], prm["k"], league),
                "league": league,
            }
        pr = cached(f"/events/{m.event_id}/prediction/").get("markets") or {}
        od = cached(f"/events/{m.event_id}/odds/")
        lu = cached(f"/events/{m.event_id}/lineups/")
        o = od.get("odds") or {}
        implied = None
        if o.get("home_win") and o.get("draw") and o.get("away_win"):
            inv = [1 / o["home_win"], 1 / o["draw"], 1 / o["away_win"]]
            implied = [x / sum(inv) for x in inv]
        provider_xi = {}
        for side in ("home", "away"):
            t = (lu.get("lineups") or {}).get(side) or {}
            provider_xi[side] = {"formation": t.get("formation"), "confidence": t.get("confidence"),
                                 "players": [p["id"] for p in t.get("players", []) if p.get("id")]}
        forecasts[m.event_id] = {
            "eventId": m.event_id, "round": m.round, "kickoff": m.kickoff, "home": slug[m.home_id], "away": slug[m.away_id],
            "probs": [ph, pd_, pa], "expGoals": [lh, la],
            "scores": [{"home": i, "away": j, "p": p} for p, i, j in top],
            "over25": float(sum(sm[i, j] for i in range(9) for j in range(9) if i + j > 2)),
            "btts": float(sm[1:, 1:].sum()),
            "tendencies": tend,
            "lineups": {"home": lineup_forecast(m.home_id), "away": lineup_forecast(m.away_id)},
            "provider": {
                "probs": [pr["match_result"][k] / 100 for k in ("prob_home", "prob_draw", "prob_away")] if pr.get("match_result") else None,
                "lineupStatus": lu.get("lineup_status"), "xi": provider_xi,
            },
            "odds": {"home": o.get("home_win"), "draw": o.get("draw"), "away": o.get("away_win"),
                     "implied": implied, "updated": od.get("last_update_at")} if implied else None,
        }

    # ---- one file per team
    out = WEB_DATA
    if out.exists():
        shutil.rmtree(out)
    values = {(r.team_id, r.metric, r.grouping): [r.value, int(r["rank"]), r.pct] for _, r in metrics.iterrows()}
    for tid in team_ids:
        t = cur[cur.team_id == tid].sort_values("kickoff")
        sched = cur_matches[(cur_matches.home_id == tid) | (cur_matches.away_id == tid)]
        det = t.set_index("event_id")
        schedule = []
        for m in sched.itertuples():
            home = m.home_id == tid
            played = m.status == "finished"
            d = det.loc[m.event_id] if m.event_id in det.index else None
            schedule.append({
                "eventId": m.event_id, "round": m.round, "kickoff": m.kickoff, "opponent": slug[m.away_id if home else m.home_id],
                "isHome": home, "played": played,
                "gf": (m.home_goals if home else m.away_goals) if played else None,
                "ga": (m.away_goals if home else m.home_goals) if played else None,
                "xgf": d.xg if d is not None else None, "xga": d.xg_a if d is not None else None,
                "formation": d.formation if d is not None else None,
            })
        pmatch = per_match[per_match.team_id == tid].set_index("event_id")
        games = [{"eventId": int(e), "v": {k: pmatch.loc[e, k] for k in pmatch.columns if k != "team_id"}}
                 for e in t.event_id if e in pmatch.index]

        mins = {s: float(t[f"min_{s}"].sum()) for s in ("lead", "level", "trail")}
        total_min = sum(mins.values()) or 1
        state = {s: {"share": mins[s] / total_min,
                     "xgf90": 90 * float(t[f"xg_{s}"].sum()) / mins[s] if mins[s] else None,
                     # the opponent's xG while we are in this state (their state is the mirror image)
                     "xga90": 90 * float(t[f"xg_{MIRROR[s]}_a"].sum()) / mins[s] if mins[s] else None,
                     "leagueShare": float(cur[f"min_{s}"].sum() / (cur[["min_lead", "min_level", "min_trail"]].sum().sum())),
                     "leagueXg90": 90 * float(cur[f"xg_{s}"].sum() / cur[f"min_{s}"].sum())}
                 for s in ("lead", "level", "trail")}
        halves = {h: {"gf": float(t[f"goals_{h}"].mean()), "ga": float(t[f"goals_{h}_a"].mean()),
                      "xgf": float(t[f"xg_{h}"].mean()), "xga": float(t[f"xg_{h}_a"].mean()),
                      "leagueGoals": float(cur[f"goals_{h}"].mean()), "leagueXg": float(cur[f"xg_{h}"].mean())}
                  for h in ("1h", "2h")}
        sf, sa = shots[shots.team_id == tid], shots[shots.opp_id == tid]
        pack = lambda d: [[round(r.x, 1), round(r.y, 1), round(r.xg, 2), int(r.is_goal),  # noqa: E731
                           "p" if r.situation == "penalty" else "s" if r.situation in SET_PIECE else "f" if r.situation == "fast-break" else "o"]
                          for r in d.itertuples()]

        events = t.event_id.tolist()
        players = team_players[tid]
        mg = managers.get(tid) or {}
        write(out / "teams" / f"{slug[tid]}.json", {
            **T[tid], "position": pos[slug[tid]],
            "manager": {"name": mg.get("name"), "preferredFormation": mg.get("preferred_formation"),
                        "profile": mg.get("tactical_profile")} if mg else None,
            "schedule": schedule,
            "metrics": {m.key: {g: values.get((tid, m.key, g)) for g in ("season", "last5", "home", "away")} for m in METRICS},
            "games": games,
            "formations": t.formation.dropna().value_counts().to_dict(),
            "splits": {"state": state, "halves": halves, "for": shot_groups(sf), "against": shot_groups(sa)},
            "shots": {"for": pack(sf), "against": pack(sa)},
            "players": players,
            "trends": trends.team_trends(per_match[per_match.team_id == tid].set_index("event_id").loc[events], league_avg["season"]),
            "playerTrends": trends.player_trends(players),
        })
    for eid, f in forecasts.items():
        write(out / "predictions" / f"{eid}.json", f)

    est = float(shots.xg_estimated.mean()) if len(shots) else None
    done = cur_matches[cur_matches.status == "finished"]
    write(out / "meta.json", {
        "season": season, "builtAt": info.built_at, "lastMatch": done.kickoff.max(),
        "roundsPlayed": int(done["round"].max()), "matchesPlayed": len(done), "matchesTotal": len(cur_matches),
        "defaultTeam": slug.get(DEFAULT_TEAM_ID, table[0]["team"]),
        "teams": [T[tid] for tid in sorted(team_ids, key=lambda i: T[i]["name"])],
        "table": table,
        "metrics": {m.key: {"label": m.label, "unit": m.unit, "category": m.category, "better": m.better,
                            "format": m.format, "order": i} for i, m in enumerate(METRICS)},
        "leagueAvg": league_avg,
        "leagueShots": {k: {a: [v[0] / n_team_matches, v[1] / n_team_matches, v[2] / n_team_matches] for a, v in d.items()}
                        for k, d in all_groups.items()},
        "xgEstimatedShare": est,
        "upcoming": sorted(forecasts),
        "logStats": LOG_STATS,
    })
    write(out / "backtest.json", P["backtest"])
    print(f"export: {len(team_ids)} teams, {len(forecasts)} forecasts -> {out}")


if __name__ == "__main__":
    main()

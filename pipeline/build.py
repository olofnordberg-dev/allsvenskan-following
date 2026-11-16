"""Build the DuckDB database from the raw JSON.

Tables
  matches       one row per league match (all downloaded seasons)
  team_match    one row per team per finished match with detail: the team's
                numbers and, with the suffix _a, the opponent's
  shots         one row per shot
  player_match  one row per player per match (minutes, starts, output)
  team_metrics  every metric in pipeline.metrics for every grouping, with
                league rank, percentile and league average

The database is rebuilt from scratch into a temporary file and swapped in
only when every step succeeded.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import duckdb
import pandas as pd

from . import api
from .config import DB_PATH, DETAIL_SEASONS_BACK, FIRST_RESULTS_SEASON, LEAGUE_ID, RECENT_MATCHES
from .metrics import METRICS

SET_PIECE = {"corner", "set-piece", "free-kick", "throw-in-set-piece"}
OPEN_PLAY = {"assisted", "regular", "fast-break"}

# stat key in the API -> column here (plain numbers)
PLAIN = {
    "total_shots": "shots", "shots_on_target": "sot", "shots_inside_box": "sib",
    "shots_outside_box": "sob", "big_chances": "big_chances",
    "touches_in_penalty_area": "touches_box", "final_third_entries": "f3_entries",
    "passes": "passes", "accurate_passes": "acc_passes", "corner_kicks": "corners",
    "fouls": "fouls", "yellow_cards": "yellows", "red_cards": "reds",
    "total_tackles": "tackles", "interceptions": "interceptions",
    "recoveries": "recoveries", "clearances": "clearances",
    "goalkeeper_saves": "saves", "offsides": "offsides", "ball_possession": "possession",
}
BASIC = {"shots", "sot", "corners", "fouls", "yellows", "reds", "offsides", "possession"}
# stat key -> column, for {value, total, pct} objects (total = attempts)
RATIO = {"long_balls": "long_balls", "crosses": "crosses", "dribbles": "dribbles"}


def cached(path: str, params: dict | None = None):
    f = api.cache_path(path, params)
    return json.loads(f.read_text()) if f.exists() else {}


def cached_all(path: str, params: dict) -> list[dict]:
    out, offset = [], 0
    while True:
        d = cached(path, {**params, "limit": 200, "offset": offset})
        out += d.get("results", [])
        if not d.get("next"):
            return out
        offset += 200


def load_matches() -> tuple[pd.DataFrame, dict, dict]:
    seasons = cached(f"/leagues/{LEAGUE_ID}/seasons/")["seasons"]
    current = next(s for s in seasons if s["is_current"])
    rows, names = [], {}
    for s in seasons:
        if s["year"] < FIRST_RESULTS_SEASON:
            continue
        for e in cached_all("/events/", {"league_id": LEAGUE_ID, "season_id": s["id"]}):
            # The feed keeps a few orphaned copies of rescheduled fixtures.
            if e["stage"] != "league-phase" or e["status"] not in ("finished", "notstarted", "inprogress", "postponed"):
                continue
            if e.get("replaced_by"):
                continue
            names[e["home_team_id"]] = e["home_team"]
            names[e["away_team_id"]] = e["away_team"]
            rows.append({
                "event_id": e["id"], "season": s["year"], "round": e["round_number"],
                "kickoff": e["event_date"], "status": e["status"],
                "home_id": e["home_team_id"], "away_id": e["away_team_id"],
                "home_goals": e["home_score"], "away_goals": e["away_score"],
                "home_ht": e["home_score_ht"], "away_ht": e["away_score_ht"],
                "venue_id": e.get("venue_id"), "referee_id": e.get("referee_id"),
                "home_coach_id": e.get("home_coach_id"), "away_coach_id": e.get("away_coach_id"),
            })
    m = pd.DataFrame(rows)
    m["kickoff"] = pd.to_datetime(m["kickoff"], utc=True)
    # A fixture listed twice (rescheduled): keep the finished copy, else the later date.
    m["_fin"] = (m["status"] == "finished").astype(int)
    m = (m.sort_values(["_fin", "kickoff"]).drop_duplicates(["season", "home_id", "away_id"], keep="last")
         .drop(columns="_fin").sort_values("kickoff").reset_index(drop=True))
    return m, names, current


def state_minutes(goal_minutes: list[tuple[int, bool]], is_home: bool, end: int = 90) -> dict:
    """Minutes spent leading / level / trailing, from the goal timeline."""
    out = {"lead": 0, "level": 0, "trail": 0}
    diff, last = 0, 0
    for minute, home_scored in sorted(goal_minutes):
        minute = min(max(minute, 0), end)
        out["lead" if diff > 0 else "trail" if diff < 0 else "level"] += minute - last
        last = minute
        diff += 1 if home_scored == is_home else -1
    out["lead" if diff > 0 else "trail" if diff < 0 else "level"] += end - last
    return out


def state_at(goal_minutes: list[tuple[int, bool]], minute: int, is_home: bool) -> str:
    diff = sum((1 if h == is_home else -1) for m, h in goal_minutes if m < minute)
    return "lead" if diff > 0 else "trail" if diff < 0 else "level"


def side_row(stats: dict, shots: list[dict], is_home: bool, goals: list[tuple[int, bool]]) -> dict:
    """One team's numbers for one match."""
    r: dict = {}
    # Three depths of team stats exist: none (early 2025), basic, and full.
    # Within a depth the feed leaves a count out when it is zero.
    has_basic, has_full = "ball_possession" in stats, "passes" in stats
    for k, col in PLAIN.items():
        present = has_basic if col in BASIC else has_full
        r[col] = (stats.get(k) or 0) if present else None
    for k, col in RATIO.items():
        v = stats.get(k) or {}
        r[col] = (v.get("total") or 0) if has_full else None
        r[f"acc_{col}"] = (v.get("value") or 0) if has_full else None
    mine = [s for s in shots if s["home"] == is_home]
    if not has_basic and shots:
        r["shots"] = len(mine)
        r["sot"] = sum(s["type"] in ("goal", "save") for s in mine)
    xg = lambda ss: round(sum(s.get("xg") or 0 for s in ss), 3)  # noqa: E731
    r["xg"] = xg(mine)
    pens = [s for s in mine if s["sit"] == "penalty"]
    sp = [s for s in mine if s["sit"] in SET_PIECE]
    op = [s for s in mine if s["sit"] in OPEN_PLAY]
    fb = [s for s in mine if s["sit"] == "fast-break"]
    r.update(
        pens=len(pens), pen_xg=xg(pens), pen_goals=sum(s["type"] == "goal" for s in pens),
        sp_shots=len(sp), sp_xg=xg(sp), sp_goals=sum(s["type"] == "goal" for s in sp),
        op_shots=len(op), op_xg=xg(op), op_goals=sum(s["type"] == "goal" for s in op),
        fb_shots=len(fb), fb_xg=xg(fb),
        head_shots=sum(s["body"] == "head" for s in mine),
        xg_1h=xg([s for s in mine if s["min"] <= 45]), xg_2h=xg([s for s in mine if s["min"] > 45]),
    )
    for st in ("lead", "level", "trail"):
        r[f"xg_{st}"] = xg([s for s in mine if state_at(goals, s["min"], is_home) == st])
    return r


def load_people(detail: pd.DataFrame) -> dict:
    """player id -> name, short name, position; from line-ups, squads and substitutions."""
    people: dict = {}
    for m in detail.itertuples():
        for i in cached(f"/events/{m.event_id}/incidents/").get("incidents", []):
            for key in ("player", "player_in", "player_out"):
                pid = i.get(f"{key}_id")
                if pid and i.get(key):
                    people.setdefault(pid, {"name": i[key], "short_name": i[key], "position": ""})
    for m in detail.itertuples():
        lu = (cached(f"/events/{m.event_id}/lineups/").get("lineups") or {})
        for side in ("home", "away"):
            t = lu.get(side) or {}
            for p in t.get("players", []) + t.get("substitutes", []):
                if p.get("id"):
                    people[p["id"]] = {"name": p["name"], "short_name": p.get("short_name") or p["name"],
                                       "position": p.get("position") or ""}
    for team_id in set(detail.home_id):
        for p in cached(f"/teams/{team_id}/squad/").get("players", []):
            old = people.get(p["id"], {})
            people[p["id"]] = {"name": p["name"], "short_name": p.get("short_name") or p["name"],
                               "position": p.get("position") or old.get("position", "")}
    return people


def build_detail(matches: pd.DataFrame, current_year: int):
    team_rows, shot_rows, player_rows, avail_rows = [], [], [], []
    detail = matches[(matches.season >= current_year - DETAIL_SEASONS_BACK) & (matches.status == "finished")]
    people = load_people(detail)
    for m in detail.itertuples():
        st = cached(f"/events/{m.event_id}/stats/")
        if not st.get("stats"):
            continue
        shots = st.get("shotmap") or []
        inc = cached(f"/events/{m.event_id}/incidents/").get("incidents", [])
        goals = [(i["minute"], bool(i["is_home"])) for i in inc if i["type"] == "goal"]
        lu = cached(f"/events/{m.event_id}/lineups/")
        ps = cached(f"/events/{m.event_id}/player-stats/").get("player_stats", [])
        sides = {}
        for side, is_home in (("home", True), ("away", False)):
            sides[is_home] = side_row(st["stats"][side], shots, is_home, goals)
            sides[is_home].update({f"min_{k}": v for k, v in state_minutes(goals, is_home).items()})
        for is_home in (True, False):
            me, opp = sides[is_home], sides[not is_home]
            gf, ga = (m.home_goals, m.away_goals) if is_home else (m.away_goals, m.home_goals)
            hf, ha = (m.home_ht, m.away_ht) if is_home else (m.away_ht, m.home_ht)
            team_id = m.home_id if is_home else m.away_id
            lineup = (lu.get("lineups") or {}).get("home" if is_home else "away") or {}
            row = {
                "event_id": m.event_id, "season": m.season, "round": m.round, "kickoff": m.kickoff,
                "team_id": team_id, "opp_id": m.away_id if is_home else m.home_id, "is_home": is_home,
                "goals": gf, "goals_a": ga, "points": 3 if gf > ga else 1 if gf == ga else 0,
                "win": int(gf > ga), "draw": int(gf == ga), "loss": int(gf < ga),
                "clean_sheet": int(ga == 0), "failed_to_score": int(gf == 0),
                "goals_1h": hf, "goals_2h": None if hf is None else gf - hf,
                "goals_1h_a": ha, "goals_2h_a": None if ha is None else ga - ha,
                "formation": lineup.get("formation"),
            }
            row.update(me)
            row.update({f"{k}_a": v for k, v in opp.items() if not k.startswith("min_")})
            team_rows.append(row)
            # Who started: played, and did not come on as a substitute. (Line-ups for
            # part of 2025 carry names without ids, so they cannot be relied on here.)
            subbed_on = {i.get("player_in_id") for i in inc if i["type"] == "substitution"}
            xg_by_player: dict = {}
            for s in shots:
                if s["home"] == is_home and s["sit"] != "penalty":
                    xg_by_player[s["player_id"]] = xg_by_player.get(s["player_id"], 0) + (s.get("xg") or 0)
            for s in ps:
                if s["team_id"] != team_id:
                    continue
                pid = s["player_id"]
                who = people.get(pid, {})
                minutes = s.get("minutes_played") or 0
                player_rows.append({
                    "event_id": m.event_id, "season": m.season, "kickoff": m.kickoff, "team_id": team_id,
                    "player_id": pid, "name": who.get("name") or f"Player {pid}",
                    "short_name": who.get("short_name") or who.get("name") or f"Player {pid}",
                    "position": who.get("position") or "", "started": minutes > 0 and pid not in subbed_on,
                    "minutes": minutes,
                    "goals": s.get("goals") or 0, "assists": s.get("goal_assist") or 0,
                    "shots": s.get("total_shots") or 0, "sot": s.get("shots_on_target") or 0,
                    "key_passes": s.get("key_pass") or 0, "npxg": round(xg_by_player.get(pid, 0), 3),
                    "touches": s.get("touches") or 0, "rating": s.get("rating"),
                    "yellow": s.get("yellow_card") or 0, "red": s.get("red_card") or 0,
                })
            for u in (lu.get("unavailable_players") or {}).get("home" if is_home else "away", []):
                avail_rows.append({"event_id": m.event_id, "team_id": team_id, "player_id": u["id"],
                                   "status": u.get("status"), "reason": u.get("reason")})
        for s in shots:
            shot_rows.append({
                "event_id": m.event_id, "season": m.season,
                "team_id": m.home_id if s["home"] else m.away_id,
                "opp_id": m.away_id if s["home"] else m.home_id,
                "player_id": s.get("player_id"), "minute": s["min"],
                "x": s["pos"]["x"], "y": s["pos"]["y"], "xg": s.get("xg") or 0,
                "situation": s["sit"], "body": s["body"], "outcome": s["type"],
                "is_goal": s["type"] == "goal", "xg_estimated": bool(s.get("xg_estimated")),
            })
    return (pd.DataFrame(team_rows), pd.DataFrame(shot_rows), pd.DataFrame(player_rows),
            pd.DataFrame(avail_rows, columns=["event_id", "team_id", "player_id", "status", "reason"]))


def metric_sql() -> str:
    """One SELECT per metric and grouping, generated from the metric list."""
    groupings = {
        "season": "TRUE",
        "last5": f"rn <= {RECENT_MATCHES}",
        "home": "is_home",
        "away": "NOT is_home",
    }
    parts = []
    for g, where in groupings.items():
        for m in METRICS:
            parts.append(
                f"SELECT team_id, '{g}' AS grouping, '{m.key}' AS metric, "
                f"CAST(sum({m.num}) AS DOUBLE) / nullif(sum({m.den}), 0) AS value, count(*) AS matches "
                f"FROM cur WHERE {where} GROUP BY team_id"
            )
    return "\nUNION ALL\n".join(parts)


def main() -> None:
    matches, names, current = load_matches()
    year = current["year"]
    team_match, shots, player_match, unavailable = build_detail(matches, year)
    teams = pd.DataFrame([{"team_id": k, "name": v} for k, v in names.items()])

    tmp = DB_PATH.with_suffix(".tmp.duckdb")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    for name, df in [("matches", matches), ("team_match", team_match), ("shots", shots),
                     ("player_match", player_match), ("unavailable", unavailable), ("teams", teams)]:
        con.register("df", df)
        con.execute(f"CREATE TABLE {name} AS SELECT * FROM df")
        con.unregister("df")
    con.execute(f"""
        CREATE VIEW cur AS
        SELECT *, row_number() OVER (PARTITION BY team_id ORDER BY kickoff DESC) AS rn
        FROM team_match WHERE season = {year}
    """)
    better = {m.key: m.better for m in METRICS}
    con.execute("CREATE TABLE metric_defs (metric VARCHAR, better VARCHAR)")
    con.executemany("INSERT INTO metric_defs VALUES (?, ?)", list(better.items()))
    con.execute(f"""
        CREATE TABLE team_metrics AS
        WITH v AS ({metric_sql()})
        SELECT v.*,
               -- 1st = best; for tendencies (no direction) 1st = highest
               rank() OVER (PARTITION BY grouping, v.metric ORDER BY
                   CASE WHEN d.better = 'low' THEN value ELSE -value END NULLS LAST) AS rank,
               1 - percent_rank() OVER (PARTITION BY grouping, v.metric ORDER BY
                   CASE WHEN d.better = 'low' THEN value ELSE -value END NULLS LAST) AS pct,
               avg(value) OVER (PARTITION BY grouping, v.metric) AS league_avg
        FROM v JOIN metric_defs d USING (metric)
    """)
    con.execute("CREATE TABLE build_info AS SELECT ? AS season, ? AS season_id, ? AS built_at",
                [year, current["id"], datetime.now(timezone.utc).isoformat()])
    n = con.execute("SELECT count(*) FROM team_match").fetchone()[0]
    con.close()
    tmp.replace(DB_PATH)
    print(f"build: {len(matches)} matches, {n} team-match rows, {len(shots)} shots, {len(player_match)} player rows")


if __name__ == "__main__":
    main()

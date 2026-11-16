"""Phase 0: audit what the Bzzoiro Sports Data (BSD) API holds for Allsvenskan.

Downloads every relevant resource, caches the raw JSON under data/audit-raw/ (not
committed) and prints a report of what exists, how complete it is and how
fresh it is.

    BSD_TOKEN=... python scripts/phase0_audit.py > docs/phase0-audit-output.txt

In a cloud session where the token is saved as a network secret, BSD_TOKEN can
be left unset: the proxy adds the header.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests

BASE = "https://sports.bzzoiro.com/api/v2"
LEAGUE = 26  # Allsvenskan
RAW = Path(__file__).resolve().parent.parent / "data" / "audit-raw"
SESSION = requests.Session()
if os.environ.get("BSD_TOKEN"):
    SESSION.headers["Authorization"] = f"Token {os.environ['BSD_TOKEN']}"
CALLS = 0
QUOTA = ""


def get(path: str, **params):
    """GET with an on-disk cache; returns parsed JSON or {'_error': status}."""
    global CALLS, QUOTA
    key = path.strip("/").replace("/", "_") + (
        "__" + "_".join(f"{k}-{v}" for k, v in sorted(params.items())) if params else ""
    )
    f = RAW / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    for attempt in range(4):
        r = SESSION.get(BASE + path, params=params, timeout=60)
        CALLS += 1
        QUOTA = r.headers.get("Ratelimit", QUOTA)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 * (attempt + 1))
            continue
        break
    data = r.json() if r.status_code == 200 else {"_error": r.status_code, "_body": r.text[:200]}
    RAW.mkdir(exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False))
    time.sleep(0.15)
    return data


def get_all(path: str, **params):
    out, offset = [], 0
    while True:
        d = get(path, limit=200, offset=offset, **params)
        out += d.get("results", [])
        if not d.get("next"):
            return out
        offset += 200


def filled(v) -> bool:
    return v not in (None, "", [], {})


def fill_table(rows: list[dict], title: str):
    print(f"\n{title} (n={len(rows)})")
    keys = Counter()
    for r in rows:
        for k, v in r.items():
            keys[k] += filled(v)
    allkeys = sorted({k for r in rows for k in r})
    for k in allkeys:
        print(f"  {k:<34}{100 * keys[k] / len(rows):5.0f}% filled")


def h(s):
    print(f"\n{'=' * 78}\n{s}\n{'=' * 78}")


def main():
    random.seed(0)
    h("1. League and seasons")
    league = get(f"/leagues/{LEAGUE}/")
    print(json.dumps({k: v for k, v in league.items() if k != "current_season"}, ensure_ascii=False))
    seasons = get(f"/leagues/{LEAGUE}/seasons/")["seasons"]
    cur = next(s for s in seasons if s["is_current"])
    events_by_season = {}
    print(f"{'season':<8}{'events':>7}{'finished':>9}{'league':>7}{'teams':>6}{'rounds':>7}  first..last finished")
    for s in seasons:
        ev = get_all("/events/", league_id=LEAGUE, season_id=s["id"])
        events_by_season[s["year"]] = ev
        fin = [e for e in ev if e["status"] == "finished"]
        lg = [e for e in ev if e["stage"] == "league-phase"]
        teams = {e["home_team_id"] for e in lg} | {e["away_team_id"] for e in lg}
        dates = sorted(e["event_date"][:10] for e in fin)
        print(
            f"{s['year']:<8}{len(ev):>7}{len(fin):>9}{len(lg):>7}{len(teams):>6}"
            f"{max((e['round_number'] or 0) for e in lg):>7}  {dates[0] if dates else '-'}..{dates[-1] if dates else '-'}"
        )

    h(f"2. Current season {cur['year']}: match list")
    ev = events_by_season[cur["year"]]
    print("status counts:", dict(Counter(e["status"] for e in ev)))
    print("stage counts:", dict(Counter(e["stage"] for e in ev)))
    lg = [e for e in ev if e["stage"] == "league-phase"]
    pair = Counter((e["home_team_id"], e["away_team_id"]) for e in lg)
    dups = {k: v for k, v in pair.items() if v > 1}
    print(f"league-phase matches: {len(lg)} (16 teams x 15 home games = 240 expected)")
    print(f"home/away pairings listed more than once: {len(dups)}")
    for (hh, aa) in dups:
        for e in lg:
            if (e["home_team_id"], e["away_team_id"]) == (hh, aa):
                print(f"   id={e['id']} {e['event_date'][:10]} R{e['round_number']} {e['home_team']} - {e['away_team']} "
                      f"{e['status']} {e['home_score']}-{e['away_score']} replaced_by={e['replaced_by']}")
    per_team = Counter()
    for e in lg:
        if e["status"] == "finished":
            per_team[e["home_team"]] += 1
            per_team[e["away_team"]] += 1
    print("finished league matches per team:", dict(sorted(per_team.items())))
    fin = sorted((e for e in lg if e["status"] == "finished"), key=lambda e: e["event_date"])
    nxt = sorted((e for e in lg if e["status"] == "notstarted"), key=lambda e: e["event_date"])
    print("last finished:", fin[-1]["event_date"], fin[-1]["home_team"], "-", fin[-1]["away_team"])
    print("remaining league fixtures:", len(nxt), "| next:", nxt[0]["event_date"] if nxt else "-")
    fill_table(fin, "Event fields, finished league matches")

    h("3. Per-match resources: availability flags")
    def avail(evts, label):
        c, n, lus, keys = Counter(), 0, Counter(), Counter()
        for e in evts:
            a = get(f"/events/{e['id']}/availability/")
            if "_error" in a:
                c["_error"] += 1
                continue
            n += 1
            lus[a.get("lineup_status")] += 1
            for k, v in a["available"].items():
                c[k] += bool(v)
            for k in a.get("stat_keys", []):
                keys[k] += 1
        print(f"\n{label}: n={n}  lineup_status={dict(lus)}")
        print("  " + "  ".join(f"{k}={100 * v / max(n, 1):.0f}%" for k, v in sorted(c.items())))
        return keys, n

    keys, n = avail(fin, f"{cur['year']} all finished league matches")
    print("  team stat keys present in <100% of matches:",
          {k: f"{100 * v / n:.0f}%" for k, v in sorted(keys.items()) if v < n} or "none")
    print(f"  team stat keys ({len(keys)}):", ", ".join(sorted(keys)))
    for year in sorted(events_by_season, reverse=True):
        if year == cur["year"]:
            continue
        f2 = [e for e in events_by_season[year] if e["status"] == "finished" and e["stage"] == "league-phase"]
        sample = f2 if year == cur["year"] - 1 else random.sample(f2, min(12, len(f2)))
        avail(sample, f"{year} ({'all' if len(sample) == len(f2) else 'sample'})")

    h(f"4. Per-match detail, sample of {cur['year']} matches")
    sample = random.sample(fin, 24)
    shots, pstats, incs, lineup_players, unavailable = [], [], Counter(), [], []
    xg_est, shot_est, team_xg = Counter(), Counter(), []
    for e in sample:
        st = get(f"/events/{e['id']}/stats/")
        xg_est[st.get("xg_estimated")] += 1
        for s in st.get("shotmap") or []:
            shots.append(s)
            shot_est[s.get("xg_estimated")] += 1
        team_xg.append((st.get("stats") or {}).get("home", {}).get("xg"))
        ps = get(f"/events/{e['id']}/player-stats/")
        pstats += ps.get("player_stats", [])
        for i in get(f"/events/{e['id']}/incidents/").get("incidents", []):
            incs[i.get("type")] += 1
        lu = get(f"/events/{e['id']}/lineups/")
        for side in ("home", "away"):
            t = (lu.get("lineups") or {}).get(side) or {}
            lineup_players += t.get("players", []) + t.get("substitutes", [])
            unavailable += (lu.get("unavailable_players") or {}).get(side, [])
    print("match-level xg_estimated flag:", dict(xg_est))
    print("shot-level xg_estimated flag:", dict(shot_est), "| shots per match:", round(len(shots) / len(sample), 1))
    print("example team xg object:", team_xg[0])
    print("incident types:", dict(incs))
    fill_table(shots, "Shot fields")
    fill_table(pstats, "Player match-stat fields")
    fill_table(lineup_players, "Line-up player fields")
    if unavailable:
        fill_table(unavailable, "Unavailable-player fields (in line-up response)")
        print("  example:", json.dumps(unavailable[0], ensure_ascii=False))
        print("  reasons:", dict(Counter(str(u.get('reason') or u.get('type')) for u in unavailable)))

    h("5. Season-level and team-level resources")
    stand = get(f"/leagues/{LEAGUE}/standings/", season_id=cur["id"])
    rows = stand.get("standings") or stand.get("results") or stand
    print("standings top-level keys:", list(stand.keys()) if isinstance(stand, dict) else type(stand))
    try:
        flat = rows if isinstance(rows, list) and rows and "team" in json.dumps(rows[0])[:400] else rows
        print("first row:", json.dumps(flat[0], ensure_ascii=False)[:700])
        print("rows:", len(flat))
    except Exception as ex:  # shape unknown in advance
        print("could not parse standings:", ex, json.dumps(stand)[:500])
    team_id = fin[-1]["home_team_id"]
    squad = get(f"/teams/{team_id}/squad/")
    sp = squad.get("players") or squad.get("squad") or squad.get("results") or []
    print(f"\nsquad for team {team_id} ({fin[-1]['home_team']}): keys={list(squad.keys())} players={len(sp)}")
    if sp:
        fill_table(sp, "Squad player fields")
        print("  availability values:", dict(Counter(str(p.get('availability')) for p in sp)))
    form = get(f"/teams/{team_id}/form/", last=5, league_id=LEAGUE)
    print("\nteam form keys:", json.dumps(form, ensure_ascii=False)[:900])
    for stat in ("goals", "assists", "rating"):
        t = get(f"/leagues/{LEAGUE}/top/{stat}/", season_id=cur["id"], limit=3)
        print(f"\ntop/{stat}:", json.dumps(t, ensure_ascii=False)[:400])
    mg = get_all("/managers/", league_id=LEAGUE)
    print(f"\nmanagers: {len(mg)}")
    if mg:
        fill_table(mg, "Manager fields")
    rf = get_all("/referees/", league_id=LEAGUE)
    print(f"\nreferees: {len(rf)}", json.dumps(rf[0], ensure_ascii=False)[:400] if rf else "")

    h("6. Upcoming matches: what is known before kick-off")
    for e in nxt[:3]:
        a = get(f"/events/{e['id']}/availability/")
        lu = get(f"/events/{e['id']}/lineups/")
        pr = get(f"/events/{e['id']}/prediction/")
        od = get(f"/events/{e['id']}/odds/")
        un = lu.get("unavailable_players") or {}
        print(f"\n{e['event_date']} {e['home_team']} - {e['away_team']} (id {e['id']})")
        print("  available:", a.get("available"))
        print("  lineup_status:", lu.get("lineup_status"), "| beta:", lu.get("beta"),
              "| formations:", {s: ((lu.get('lineups') or {}).get(s) or {}).get('formation') for s in ('home', 'away')},
              "| unavailable:", {s: len(un.get(s, [])) for s in ("home", "away")})
        print("  prediction:", json.dumps(pr.get("markets", pr), ensure_ascii=False)[:300])
        print("  odds:", json.dumps(od.get("odds", od), ensure_ascii=False)[:200], "| updated", od.get("last_update_at"))

    h("7. Freshness")
    last = fin[-1]
    lu = get(f"/events/{last['id']}/lineups/")
    pr = get(f"/events/{last['id']}/prediction/")
    print("last finished match kick-off:", last["event_date"])
    print("its prediction record last updated:", pr.get("updated_at"), "(set when the result was settled)")
    print("its line-up record last updated:", lu.get("updated_at"))
    print("docs: hot endpoints edge-cached ~5 s; live scores carried during matches")

    h("8. API usage")
    print("requests made this run:", CALLS, "| quota header:", QUOTA, "(policy: 7500 requests per day)")


if __name__ == "__main__":
    sys.exit(main())

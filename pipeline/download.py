"""Download everything the build needs into data/raw (cached; finished matches are kept)."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from . import api
from .config import DETAIL_SEASONS_BACK, FIRST_RESULTS_SEASON, LEAGUE_ID

DETAIL = ("stats", "lineups", "player-stats", "incidents", "odds")
UPCOMING = ("lineups", "prediction", "odds")


def main() -> None:
    now = datetime.now(timezone.utc)
    seasons = api.get(f"/leagues/{LEAGUE_ID}/seasons/", refresh=True)["seasons"]
    current = next(s for s in seasons if s["is_current"])
    jobs: list[tuple[str, bool]] = []
    for s in seasons:
        if s["year"] < FIRST_RESULTS_SEASON:
            continue
        is_current = s["id"] == current["id"]
        events = api.get_all("/events/", {"league_id": LEAGUE_ID, "season_id": s["id"]}, refresh=is_current)
        if s["year"] < current["year"] - DETAIL_SEASONS_BACK:
            continue
        for e in events:
            kickoff = datetime.fromisoformat(e["event_date"])
            if e["status"] == "finished":
                # Stats are sometimes corrected in the days after a match.
                fresh = now - kickoff < timedelta(days=4)
                jobs += [(f"/events/{e['id']}/{r}/", fresh) for r in DETAIL]
            elif e["status"] == "notstarted" and timedelta(0) <= kickoff - now < timedelta(days=21):
                jobs += [(f"/events/{e['id']}/{r}/", True) for r in UPCOMING]
    api.get(f"/leagues/{LEAGUE_ID}/standings/", {"season_id": current["id"]}, refresh=True)
    teams = api.get_all("/teams/", {"league_id": LEAGUE_ID, "season_id": current["id"]}, refresh=True)
    jobs += [(f"/teams/{t['id']}/squad/", True) for t in teams]
    api.get_all("/managers/", {"league_id": LEAGUE_ID}, refresh=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda j: api.get(j[0], refresh=j[1]), jobs))
    print(f"download: {len(jobs)} resources checked, {api.calls} requests made")


if __name__ == "__main__":
    main()

"""Settings shared by every pipeline step."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "allsvenskan.duckdb"
WEB_DATA = ROOT / "web" / "data"

API = "https://sports.bzzoiro.com/api/v2"
LEAGUE_ID = 26  # Allsvenskan

# Results are downloaded from this season on (used to fit team strengths).
FIRST_RESULTS_SEASON = 2021
# Match detail (stats, shots, line-ups, player stats) is downloaded for the
# current season and this many seasons before it. The season before the
# current one is where forecasts are tuned; the current one is where they
# are scored.
DETAIL_SEASONS_BACK = 1

RECENT_MATCHES = 5   # "recent form" window
TREND_MATCHES = 3    # window compared with the rest of the season for trends

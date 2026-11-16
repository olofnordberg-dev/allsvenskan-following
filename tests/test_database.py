"""Invariants the database must satisfy after `python -m pipeline build`."""
import duckdb
import pytest

from pipeline.config import DB_PATH


@pytest.fixture(scope="module")
def con():
    if not DB_PATH.exists():
        pytest.skip("database not built")
    c = duckdb.connect(str(DB_PATH), read_only=True)
    yield c
    c.close()


def one(con, sql):
    return con.execute(sql).fetchall()[0][0]


def season(con):
    return one(con, "SELECT season FROM build_info")


def test_each_fixture_once(con):
    assert one(con, "SELECT count(*) FROM (SELECT season, home_id, away_id FROM matches GROUP BY ALL HAVING count(*) > 1)") == 0


def test_sixteen_teams_thirty_rounds(con):
    rows = con.execute("SELECT season, count(*), count(DISTINCT home_id) FROM matches GROUP BY 1").fetchall()
    for _, n, teams in rows:
        assert teams == 16 and n == 240


def test_two_rows_per_finished_match(con):
    s = season(con)
    assert one(con, f"SELECT count(*) FROM (SELECT event_id FROM team_match WHERE season = {s} GROUP BY 1 HAVING count(*) <> 2)") == 0
    finished = one(con, f"SELECT count(*) FROM matches WHERE season = {s} AND status = 'finished'")
    assert one(con, f"SELECT count(*) FROM team_match WHERE season = {s}") == 2 * finished


def test_for_and_against_mirror(con):
    bad = one(con, """
        SELECT count(*) FROM team_match a JOIN team_match b ON a.event_id = b.event_id AND a.team_id = b.opp_id
        WHERE a.goals <> b.goals_a OR abs(a.xg - b.xg_a) > 1e-9 OR a.shots IS DISTINCT FROM b.shots_a
           OR a.points + b.points NOT IN (2, 3)
    """)
    assert bad == 0


def test_goals_match_the_score(con):
    assert one(con, """
        SELECT count(*) FROM team_match t JOIN matches m USING (event_id)
        WHERE t.goals <> CASE WHEN t.is_home THEN m.home_goals ELSE m.away_goals END
    """) == 0


def test_possession_sums_to_100(con):
    s = season(con)
    assert one(con, f"SELECT count(*) FROM team_match WHERE season = {s} AND abs(possession + possession_a - 100) > 1") == 0


def test_game_state_minutes(con):
    assert one(con, "SELECT count(*) FROM team_match WHERE min_lead + min_level + min_trail <> 90") == 0
    assert one(con, """
        SELECT count(*) FROM team_match a JOIN team_match b ON a.event_id = b.event_id AND a.team_id = b.opp_id
        WHERE a.min_lead <> b.min_trail
    """) == 0


def test_shot_parts_add_up(con):
    assert one(con, "SELECT count(*) FROM team_match WHERE abs(op_xg + sp_xg + pen_xg - xg) > 0.01") == 0
    assert one(con, "SELECT count(*) FROM team_match WHERE abs(xg_lead + xg_level + xg_trail - xg) > 0.01") == 0
    assert one(con, "SELECT count(*) FROM team_match WHERE abs(xg_1h + xg_2h - xg) > 0.01") == 0


def test_current_season_has_full_stats(con):
    s = season(con)
    assert one(con, f"SELECT count(*) FROM team_match WHERE season = {s} AND (passes IS NULL OR possession IS NULL OR shots IS NULL)") == 0


def test_about_eleven_starters(con):
    s = season(con)
    rows = con.execute(f"""
        SELECT count(*) FILTER (WHERE n = 11), count(*) FROM (
            SELECT event_id, team_id, count(*) FILTER (WHERE started) AS n FROM player_match WHERE season = {s} GROUP BY 1, 2)
    """).fetchall()[0]
    assert rows[0] / rows[1] > 0.97


def test_minutes_are_plausible(con):
    assert one(con, "SELECT count(*) FROM player_match WHERE minutes < 0 OR minutes > 130") == 0


def test_metrics_complete_and_ranked(con):
    assert one(con, "SELECT count(*) FROM team_metrics WHERE grouping = 'season' AND value IS NULL") == 0
    rows = con.execute("SELECT min(rank), max(rank), count(DISTINCT team_id) FROM team_metrics GROUP BY grouping, metric").fetchall()
    for lo, hi, teams in rows:
        assert lo == 1 and hi <= 16 and teams == 16
    assert one(con, "SELECT count(*) FROM team_metrics WHERE pct < 0 OR pct > 1") == 0


def test_ppg_rank_follows_points(con):
    s = season(con)
    assert one(con, f"""
        WITH pts AS (SELECT team_id, avg(points) AS ppg FROM team_match WHERE season = {s} GROUP BY 1)
        SELECT count(*) FROM team_metrics m JOIN pts USING (team_id)
        WHERE m.metric = 'ppg' AND m.grouping = 'season' AND abs(m.value - pts.ppg) > 1e-9
    """) == 0

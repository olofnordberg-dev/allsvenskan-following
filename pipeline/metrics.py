"""Every team metric, defined once.

Each metric is a ratio of two sums over a team's matches (`num` / `den`, where
den "1" means "per match"). Tables, ranks, percentiles, league averages, trends
and the site's tables are all generated from this list.

`better` is "high", "low" or None. None marks a tendency: neither good nor
bad, ranked 1st = highest.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str        # results | attack | defence | set_pieces | style
    category: str
    num: str
    den: str
    better: str | None
    format: str      # num | pct | int


def M(key, label, unit, category, num, den="1", better="high", fmt="num") -> Metric:
    return Metric(key, label, unit, category, num, den, better, fmt)


NP = "(xg - pen_xg)"
NP_A = "(xg_a - pen_xg_a)"
DEF_ACTIONS = "(tackles + interceptions + fouls)"

METRICS: list[Metric] = [
    # ---- results
    M("ppg", "Points per match", "results", "results", "points"),
    M("gd", "Goal difference per match", "results", "results", "goals - goals_a"),
    M("xgd", "xG difference per match", "results", "results", "xg - xg_a"),
    M("npxgd", "Non-penalty xG difference per match", "results", "results", f"{NP} - {NP_A}"),

    # ---- attack
    M("goals", "Goals per match", "attack", "scoring", "goals"),
    M("xg", "xG per match", "attack", "scoring", "xg"),
    M("npxg", "Non-penalty xG per match", "attack", "scoring", NP),
    M("finishing", "Goals minus xG per match", "attack", "scoring", "goals - xg"),
    M("scored_rate", "Matches with a goal", "attack", "scoring", "1 - failed_to_score", fmt="pct"),
    M("shots", "Shots per match", "attack", "chances", "shots"),
    M("sot", "Shots on target per match", "attack", "chances", "sot"),
    M("xg_per_shot", "xG per shot", "attack", "chances", NP, "(shots - pens)"),
    M("big_chances", "Big chances per match", "attack", "chances", "big_chances"),
    M("conversion", "Shots turned into goals", "attack", "chances", "goals", "shots", fmt="pct"),
    M("box_share", "Shots from inside the box", "attack", "chances", "sib", "shots", fmt="pct"),
    M("touches_box", "Touches in the box per match", "attack", "build_up", "touches_box"),
    M("f3_entries", "Final-third entries per match", "attack", "build_up", "f3_entries"),
    M("op_xg", "Open-play xG per match", "attack", "build_up", "op_xg"),
    M("fb_xg", "Fast-break xG per match", "attack", "build_up", "fb_xg"),

    # ---- defence
    M("goals_a", "Goals conceded per match", "defence", "conceding", "goals_a", better="low"),
    M("xg_a", "xG conceded per match", "defence", "conceding", "xg_a", better="low"),
    M("npxg_a", "Non-penalty xG conceded per match", "defence", "conceding", NP_A, better="low"),
    M("clean_sheets", "Clean sheets", "defence", "conceding", "clean_sheet", fmt="pct"),
    M("shots_a", "Shots conceded per match", "defence", "chances_allowed", "shots_a", better="low"),
    M("sot_a", "Shots on target conceded per match", "defence", "chances_allowed", "sot_a", better="low"),
    M("xg_per_shot_a", "xG per shot conceded", "defence", "chances_allowed", NP_A, "(shots_a - pens_a)", better="low"),
    M("big_chances_a", "Big chances conceded per match", "defence", "chances_allowed", "big_chances_a", better="low"),
    M("touches_box_a", "Opponent touches in the box per match", "defence", "chances_allowed", "touches_box_a", better="low"),
    M("f3_entries_a", "Opponent final-third entries per match", "defence", "chances_allowed", "f3_entries_a", better="low"),
    M("op_xg_a", "Open-play xG conceded per match", "defence", "chances_allowed", "op_xg_a", better="low"),
    M("fb_xg_a", "Fast-break xG conceded per match", "defence", "chances_allowed", "fb_xg_a", better="low"),
    M("save_pct", "Shots on target saved", "defence", "goalkeeping", "saves", "sot_a", fmt="pct"),
    M("tackles", "Tackles per match", "defence", "actions", "tackles", better=None),
    M("interceptions", "Interceptions per match", "defence", "actions", "interceptions", better=None),
    M("clearances", "Clearances per match", "defence", "actions", "clearances", better=None),
    M("recoveries", "Ball recoveries per match", "defence", "actions", "recoveries", better=None),

    # ---- set pieces (corners, free kicks, throw-ins; penalties listed apart)
    M("sp_xg", "Set-piece xG per match", "set_pieces", "for", "sp_xg"),
    M("sp_goals", "Set-piece goals per match", "set_pieces", "for", "sp_goals"),
    M("sp_shots", "Set-piece shots per match", "set_pieces", "for", "sp_shots"),
    M("corners", "Corners per match", "set_pieces", "for", "corners"),
    M("sp_xg_share", "Share of xG from set pieces", "set_pieces", "for", "sp_xg", NP, better=None, fmt="pct"),
    M("pens", "Penalties won per match", "set_pieces", "for", "pens"),
    M("sp_xg_a", "Set-piece xG conceded per match", "set_pieces", "against", "sp_xg_a", better="low"),
    M("sp_goals_a", "Set-piece goals conceded per match", "set_pieces", "against", "sp_goals_a", better="low"),
    M("sp_shots_a", "Set-piece shots conceded per match", "set_pieces", "against", "sp_shots_a", better="low"),
    M("corners_a", "Corners conceded per match", "set_pieces", "against", "corners_a", better="low"),
    M("pens_a", "Penalties conceded per match", "set_pieces", "against", "pens_a", better="low"),

    # ---- style: tendencies, no direction
    M("possession", "Possession", "style", "style", "possession / 100.0", better=None, fmt="pct"),
    M("pass_acc", "Pass accuracy", "style", "style", "acc_passes", "passes", better=None, fmt="pct"),
    M("passes", "Passes per match", "style", "style", "passes", better=None, fmt="int"),
    M("long_ball_share", "Long balls, share of passes", "style", "style", "long_balls", "passes", better=None, fmt="pct"),
    M("directness", "Final-third entries per 100 passes", "style", "style", "100.0 * f3_entries", "passes", better=None),
    M("crosses", "Crosses per match", "style", "style", "crosses", better=None),
    M("dribbles", "Dribbles attempted per match", "style", "style", "dribbles", better=None),
    M("pressing", "Opponent passes per defensive action", "style", "style", "passes_a", DEF_ACTIONS, better=None),
    M("outside_share", "Shots from outside the box", "style", "style", "sob", "shots", better=None, fmt="pct"),
    M("head_share", "Headed shots", "style", "style", "head_shots", "shots", better=None, fmt="pct"),
    M("fb_shots", "Fast-break shots per match", "style", "style", "fb_shots", better=None),
    M("fouls", "Fouls per match", "style", "discipline", "fouls", better=None),
    M("yellows", "Yellow cards per match", "style", "discipline", "yellows", better=None),
    M("offsides", "Offsides per match", "style", "discipline", "offsides", better=None),
]

BY_KEY = {m.key: m for m in METRICS}

# Metrics watched for recent changes (see pipeline.trends).
TREND_METRICS = [
    "xg", "npxg", "shots", "big_chances", "touches_box", "xg_a", "shots_a", "big_chances_a",
    "touches_box_a", "sp_xg", "sp_xg_a", "corners", "possession", "pass_acc", "long_ball_share",
    "directness", "pressing", "crosses", "fb_shots", "fouls",
]

"""What is changing: the last few matches against the rest of the season.

A metric is flagged when the recent average differs from the earlier average
by more than the team's own match-to-match noise would explain (a z-score on
the standard error of the recent mean) AND by a practical minimum (a share of
the league average), so tiny but "significant" shifts stay out.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import TREND_MATCHES
from .metrics import BY_KEY, TREND_METRICS

Z_MIN = 1.6
PRACTICAL_MIN = 0.12      # of the league average
MIN_EARLIER = 6
PLAYER_SHARE_MIN = 0.25   # change in share of minutes


def team_trends(per_match: pd.DataFrame, league_avg: dict) -> list[dict]:
    """per_match: one row per match in date order, one column per metric (per-match values)."""
    out = []
    if len(per_match) < TREND_MATCHES + MIN_EARLIER:
        return out
    for key in TREND_METRICS:
        s = per_match[key].astype(float)
        recent, earlier = s.iloc[-TREND_MATCHES:].dropna(), s.iloc[:-TREND_MATCHES].dropna()
        if len(recent) < TREND_MATCHES or len(earlier) < MIN_EARLIER:
            continue
        sd = earlier.std(ddof=1)
        diff = recent.mean() - earlier.mean()
        league = abs(league_avg.get(key) or 0)
        if not sd or not league:
            continue
        z = diff / (sd / np.sqrt(len(recent)))
        if abs(z) < Z_MIN or abs(diff) < PRACTICAL_MIN * league:
            continue
        m = BY_KEY[key]
        verdict = "changed" if m.better is None else ("better" if (diff > 0) == (m.better == "high") else "worse")
        out.append({
            "metric": key, "label": m.label, "unit": m.unit, "format": m.format, "verdict": verdict,
            "recent": recent.mean(), "earlier": earlier.mean(), "diff": diff, "z": z,
            "series": [None if pd.isna(v) else float(v) for v in s],
        })
    return sorted(out, key=lambda t: -abs(t["z"]))


def player_trends(players: list[dict]) -> list[dict]:
    """Players whose share of minutes over the last matches moved clearly from before."""
    out = []
    for p in players:
        mins = [m or 0 for m in p["matchMinutes"]]
        if len(mins) < TREND_MATCHES + MIN_EARLIER:
            continue
        recent = sum(mins[-TREND_MATCHES:]) / (90 * TREND_MATCHES)
        earlier = sum(mins[:-TREND_MATCHES]) / (90 * (len(mins) - TREND_MATCHES))
        if abs(recent - earlier) >= PLAYER_SHARE_MIN:
            out.append({"id": p["id"], "name": p["name"], "position": p["position"], "recent": recent,
                        "earlier": earlier, "diff": recent - earlier, "availability": p["availability"],
                        "inSquad": p["inSquad"]})
    return sorted(out, key=lambda t: -abs(t["diff"]))

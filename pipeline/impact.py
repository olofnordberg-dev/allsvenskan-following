"""How much a player's absence matters.

Impact score (0-100) = half minutes share + half attacking share:

  minutes share   the share of the team's possible minutes the player played
  attacking share the average of the player's share of the team's non-penalty xG
                  and of its goals plus assists, scaled so the team's biggest
                  attacking contributor is 1

Minutes carry goalkeepers and defenders, who have little attacking output; the
attacking share lifts the players who create and finish the chances. Players are
ranked on the score within the current squad (1 = hardest to replace).

A team's absence weight is the impact of everyone unavailable divided by the
impact of its eleven highest-impact players: how much of the core is missing.
"""
from __future__ import annotations

MINUTES_WEIGHT = 0.5
CORE = 11
KEY_RANK, REGULAR_RANK = 5, 12
HEAVY, NOTICEABLE = 0.25, 0.10


def tier(rank: int | None, min_share: float) -> str:
    """Key: top five by impact and a regular starter. Regular: top twelve and plays most weeks."""
    if rank is not None and rank <= KEY_RANK and min_share >= 0.5:
        return "key"
    if rank is not None and rank <= REGULAR_RANK and min_share >= 0.25:
        return "regular"
    return "rotation" if min_share >= 0.15 else "fringe"


def add_impact(players: list[dict]) -> None:
    """Adds impact, impactRank (current squad only; None for players who left) and tier, in place.

    Needs minShare, xgShare, goals, assists, minutes and inSquad on every player.
    """
    contrib_total = sum(p["goals"] + p["assists"] for p in players)
    attack = {}
    for p in players:
        contrib = (p["goals"] + p["assists"]) / contrib_total if contrib_total else 0.0
        attack[p["id"]] = (p["xgShare"] + contrib) / 2
    top = max(attack.values(), default=0.0) or 1.0
    for p in players:
        p["impact"] = 100 * (MINUTES_WEIGHT * p["minShare"] + (1 - MINUTES_WEIGHT) * attack[p["id"]] / top)
    current = sorted((p for p in players if p["inSquad"]), key=lambda p: (-p["impact"], -p["minutes"]))
    ranks = {p["id"]: i for i, p in enumerate(current, 1)}
    for p in players:
        p["impactRank"] = ranks.get(p["id"])
        p["tier"] = tier(p["impactRank"], p["minShare"])


def absence_weight(players: list[dict], absent_ids: set[int]) -> dict:
    """How much of the team's core is missing: {weight 0-1, label, missing, core, ranked}."""
    current = sorted((p for p in players if p["inSquad"]), key=lambda p: p["impactRank"])
    core = sum(p["impact"] for p in current[:CORE]) or 1.0
    missing = sum(p["impact"] for p in current if p["id"] in absent_ids)
    weight = min(missing / core, 1.0)
    label = "heavy" if weight >= HEAVY else "noticeable" if weight >= NOTICEABLE else "light"
    return {"weight": weight, "label": label, "missing": missing, "core": core, "ranked": len(current)}

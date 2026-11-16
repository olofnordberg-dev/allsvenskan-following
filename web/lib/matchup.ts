// Compares two teams unit against unit and writes the "keys to the match".
import type { Forecast, Meta, TeamData } from "./data";
import { formatValue, lower, ordinal } from "./format";

/** attack metric -> the defence metric it runs into */
export const PAIRS: { attack: string; defence: string; label: string; group: "open" | "set" }[] = [
  { attack: "xg", defence: "xg_a", label: "xG per match", group: "open" },
  { attack: "shots", defence: "shots_a", label: "Shots per match", group: "open" },
  { attack: "xg_per_shot", defence: "xg_per_shot_a", label: "xG per shot", group: "open" },
  { attack: "big_chances", defence: "big_chances_a", label: "Big chances per match", group: "open" },
  { attack: "touches_box", defence: "touches_box_a", label: "Touches in the box", group: "open" },
  { attack: "op_xg", defence: "op_xg_a", label: "Open-play xG", group: "open" },
  { attack: "fb_xg", defence: "fb_xg_a", label: "Fast-break xG", group: "open" },
  { attack: "sp_xg", defence: "sp_xg_a", label: "Set-piece xG", group: "set" },
  { attack: "corners", defence: "corners_a", label: "Corners per match", group: "set" },
];

export interface Key { kind: "edge" | "risk" | "note"; text: string }

const v = (t: TeamData, m: string) => t.metrics[m]?.season;

/** 3-5 pieces of advice for `me` against `opp`, generated from the numbers. */
export function keysToTheMatch(me: TeamData, opp: TeamData, meta: Meta, forecast: Forecast | undefined, meHome: boolean): { mine: Key[]; theirs: Key[] } {
  const mine: Key[] = [];
  const theirs: Key[] = [];
  const edges = PAIRS.map((p) => {
    const a = v(me, p.attack), d = v(opp, p.defence), oa = v(opp, p.attack), md = v(me, p.defence);
    return {
      p,
      forMe: a && d ? a[2] - d[2] : 0,       // my attack percentile minus their defence percentile
      forThem: oa && md ? oa[2] - md[2] : 0,
    };
  });
  const describe = (att: TeamData, def: TeamData, p: (typeof PAIRS)[number]) => {
    const a = v(att, p.attack)!, d = v(def, p.defence)!;
    const f = meta.metrics[p.attack].format;
    return `${p.label}: ${att.short} create ${formatValue(a[0], f)} (${ordinal(a[1])}), ${def.short} allow ${formatValue(d[0], f)} (${ordinal(d[1])} best).`;
  };
  for (const e of [...edges].sort((a, b) => b.forMe - a.forMe).slice(0, 2)) {
    if (e.forMe > 0.25) mine.push({ kind: "edge", text: `Attack where they are weak. ${describe(me, opp, e.p)}` });
  }
  for (const e of [...edges].sort((a, b) => b.forThem - a.forThem).slice(0, 2)) {
    if (e.forThem > 0.25) mine.push({ kind: "risk", text: `Their strength against a soft spot. ${describe(opp, me, e.p)}` });
    if (e.forThem > 0.25) theirs.push({ kind: "edge", text: describe(opp, me, e.p) });
  }
  for (const e of [...edges].sort((a, b) => b.forMe - a.forMe).slice(0, 2)) {
    if (e.forMe > 0.25) theirs.push({ kind: "risk", text: describe(me, opp, e.p) });
  }

  // venue
  const oppVenue = opp.metrics.ppg?.[meHome ? "away" : "home"];
  const myVenue = me.metrics.ppg?.[meHome ? "home" : "away"];
  if (oppVenue && myVenue) {
    mine.push({
      kind: "note",
      text: `${me.short} take ${formatValue(myVenue[0], "num")} points per match ${meHome ? "at home" : "away"} (${ordinal(myVenue[1])}); ${opp.short} take ${formatValue(oppVenue[0], "num")} ${meHome ? "away" : "at home"} (${ordinal(oppVenue[1])}).`,
    });
  }
  // game state
  const st = opp.splits.state;
  if (st.lead.share > st.lead.leagueShare + 0.08) {
    mine.push({ kind: "risk", text: `${opp.short} have been ahead for ${Math.round(st.lead.share * 100)}% of their minutes (league ${Math.round(st.lead.leagueShare * 100)}%): the first goal matters.` });
  } else if (st.trail.share > st.trail.leagueShare + 0.08) {
    mine.push({ kind: "edge", text: `${opp.short} have been behind for ${Math.round(st.trail.share * 100)}% of their minutes (league ${Math.round(st.trail.leagueShare * 100)}%): an early lead puts them where they have struggled.` });
  }
  // recent change in the opponent
  const t = opp.trends.find((x) => x.verdict !== "changed");
  if (t) {
    mine.push({
      kind: t.verdict === "better" ? "risk" : "edge",
      text: `${opp.short} recently: ${lower(t.label)} ${formatValue(t.recent, t.format)} over the last three matches, ${formatValue(t.earlier, t.format)} before.`,
    });
  }
  // availability
  if (forecast) {
    const side = forecast.home === opp.slug ? "home" : "away";
    const mySide = side === "home" ? "away" : "home";
    const missing = (s: "home" | "away") => forecast.lineups[s].unavailable.filter((u) => u.startScore >= 0.5).map((u) => u.name);
    const theirsOut = missing(side), mineOut = missing(mySide);
    if (theirsOut.length) mine.push({ kind: "edge", text: `${opp.short} are without regular starter${theirsOut.length > 1 ? "s" : ""} ${theirsOut.join(", ")}.` });
    if (mineOut.length) mine.push({ kind: "risk", text: `${me.short} are without regular starter${mineOut.length > 1 ? "s" : ""} ${mineOut.join(", ")}.` });
  }
  return { mine: mine.slice(0, 6), theirs: theirs.slice(0, 4) };
}

// Builds the match-log data (per-match values plus opponent ranks) for the GameLog chart.
import type { LogGame, LogStat } from "@/components/charts/GameLog";
import { getMeta, getTeam, getTeamInfo } from "./data";
import { shortDate } from "./format";

/** stat -> the opponent metric whose league rank says how tough the match was */
const OPPONENT_METRIC: Record<string, string> = {
  goals: "goals_a", xg: "xg_a", shots: "shots_a", sot: "sot_a", big_chances: "big_chances_a",
  touches_box: "touches_box_a", sp_xg: "sp_xg_a", corners: "corners_a",
  goals_a: "goals", xg_a: "xg", shots_a: "shots", sp_xg_a: "sp_xg",
};
const SHORT: Record<string, string> = {
  goals: "Goals", goals_a: "Conceded", xg: "xG", xg_a: "xG against", shots: "Shots", shots_a: "Shots against",
  sot: "On target", big_chances: "Big chances", touches_box: "Box touches", possession: "Possession",
  pass_acc: "Pass acc.", corners: "Corners", sp_xg: "Set-piece xG", sp_xg_a: "Set-piece xG ag.",
  pressing: "Opp. passes / def. action", long_ball_share: "Long balls", fouls: "Fouls",
};

export function logStats(): LogStat[] {
  const meta = getMeta();
  return meta.logStats.map((key) => {
    const def = meta.metrics[key];
    const whole = ["goals", "goals_a", "shots", "shots_a", "sot", "big_chances", "touches_box", "corners", "fouls"].includes(key);
    return { key, label: SHORT[key] ?? def.label, format: whole ? "int" : def.format, better: def.better };
  });
}
export const LOG_COLUMNS = ["xg", "xg_a", "shots", "possession"];

export function buildGameLog(slug: string): LogGame[] {
  const data = getTeam(slug);
  if (!data) return [];
  const byEvent = new Map(data.games.map((g) => [g.eventId, g.v]));
  return data.schedule
    .filter((m) => m.played && byEvent.has(m.eventId))
    .map((m) => {
      const opp = getTeamInfo(m.opponent);
      const oppData = getTeam(m.opponent);
      const values = byEvent.get(m.eventId)!;
      return {
        eventId: m.eventId,
        round: m.round,
        date: shortDate(m.kickoff),
        opponent: opp?.code ?? m.opponent,
        oppLogo: opp?.logo ?? "",
        oppColor: opp?.color ?? "",
        isHome: m.isHome,
        gf: m.gf ?? 0,
        ga: m.ga ?? 0,
        values,
        oppRanks: Object.fromEntries(
          Object.keys(values).map((k) => [k, OPPONENT_METRIC[k] ? oppData?.metrics[OPPONENT_METRIC[k]]?.season?.[1] ?? null : null]),
        ),
      };
    });
}

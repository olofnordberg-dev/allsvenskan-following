// Data access for the app. Today this reads the JSON files written by
// `python -m pipeline export`; swapping to a hosted database only changes this file.
import fs from "node:fs";
import path from "node:path";

export type Unit = "results" | "attack" | "defence" | "set_pieces" | "style";
export type Grouping = "season" | "last5" | "home" | "away";
/** [value, rank, percentile]; percentile 1 = best (or highest, for tendencies). */
export type MetricValue = [number | null, number, number] | null;
export type Format = "num" | "pct" | "int";

export interface MetricDef {
  label: string;
  unit: Unit;
  category: string;
  better: "high" | "low" | null;
  format: Format;
  order: number;
}

export interface TeamInfo {
  id: number;
  slug: string;
  name: string;
  short: string;
  code: string;
  logo: string;
  color: string;
}

export interface TableRow {
  team: string; pos: number; played: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number; xgf: number; xga: number; form: string;
  zone: string | null; zoneType: string | null;
}

export interface Match {
  eventId: number; round: number; kickoff: string; opponent: string; isHome: boolean; played: boolean;
  gf: number | null; ga: number | null; xgf: number | null; xga: number | null; formation: string | null;
}

/** [shots, xG, goals] */
export type ShotAgg = [number, number, number];
export interface ShotGroups {
  group: Record<string, ShotAgg>; zone: Record<string, ShotAgg>; situation: Record<string, ShotAgg>;
  body: Record<string, ShotAgg>; band: Record<string, ShotAgg>;
}
/** [x (distance from the goal line, % of pitch length), y (0-100 across), xG, goal 0/1, kind o|s|f|p] */
export type Shot = [number, number, number, number, string];

export interface Player {
  id: number; name: string; position: string; apps: number; starts: number; minutes: number;
  minShare: number; minShareLast5: number; goals: number; assists: number; shots: number; npxg: number;
  keyPasses: number; shotShare: number; xgShare: number; rating: number | null; yellow: number; red: number;
  inSquad: boolean; availability: string | null; injury: string | null; expectedReturn: string | null;
  matchMinutes: (number | null)[]; matchStarts: boolean[];
}

export interface Trend {
  metric: string; label: string; unit: Unit; format: Format; verdict: "better" | "worse" | "changed";
  recent: number; earlier: number; diff: number; z: number; series: (number | null)[];
}
export interface PlayerTrend {
  id: number; name: string; position: string; recent: number; earlier: number; diff: number;
  availability: string | null; inSquad: boolean;
}
export interface StateSplit { share: number; xgf90: number | null; xga90: number | null; leagueShare: number; leagueXg90: number }
export interface HalfSplit { gf: number; ga: number; xgf: number; xga: number; leagueGoals: number; leagueXg: number }

export interface TeamData extends TeamInfo {
  position: number;
  manager: { name: string | null; preferredFormation: string | null; profile: string | null } | null;
  schedule: Match[];
  metrics: Record<string, Record<Grouping, MetricValue>>;
  games: { eventId: number; v: Record<string, number | null> }[];
  formations: Record<string, number>;
  splits: { state: Record<"lead" | "level" | "trail", StateSplit>; halves: Record<"1h" | "2h", HalfSplit>; for: ShotGroups; against: ShotGroups };
  shots: { for: Shot[]; against: Shot[] };
  players: Player[];
  trends: Trend[];
  playerTrends: PlayerTrend[];
}

export interface LineupPlayer { id: number; name: string; position: string; startScore: number; expMinutes: number; inEleven: boolean }
export interface Unavailable { id: number; name: string; status: string | null; reason: string | null; expectedReturn: string | null; startScore: number }
export interface LineupForecast { players: LineupPlayer[]; unavailable: Unavailable[] }
export interface Forecast {
  eventId: number; round: number; kickoff: string; home: string; away: string;
  probs: [number, number, number]; expGoals: [number, number];
  scores: { home: number; away: number; p: number }[]; over25: number; btts: number;
  tendencies: Record<string, { home: number; away: number; league: number }>;
  lineups: { home: LineupForecast; away: LineupForecast };
  provider: {
    probs: [number, number, number] | null; lineupStatus: string | null;
    xi: Record<"home" | "away", { formation: string | null; confidence: number | null; players: number[] }>;
  };
  odds: { home: number; draw: number; away: number; implied: [number, number, number]; updated: string | null } | null;
}

export interface Meta {
  season: number; builtAt: string; lastMatch: string; roundsPlayed: number; matchesPlayed: number; matchesTotal: number;
  defaultTeam: string; teams: TeamInfo[]; table: TableRow[]; metrics: Record<string, MetricDef>;
  leagueAvg: Record<Grouping, Record<string, number>>;
  /** Per team per match: [shots, xG, goals]. */
  leagueShots: ShotGroups;
  xgEstimatedShare: number | null; upcoming: number[]; logStats: string[];
}

export interface ScoreRow { name: string; kind: string; n: number; logLoss: number; rps: number; accuracy: number }
export interface Backtest {
  result: {
    tuneSeason: number; testSeason: number; params: Record<string, number>; tuneLogLoss: number;
    rows: ScoreRow[]; oddsSubset?: ScoreRow[];
    calibration: { bin: string; n: number; predicted: number; actual: number }[];
  };
  lineups: { tuneSeason: number; testSeason: number; halfLife: number; n: number; rows: { name: string; kind: string; correct: number }[] };
  tendencies: {
    tuneSeason: number; testSeason: number;
    rows: { metric: string; label: string; n: number; model: number; teamAverage: number; leagueAverage: number; halfLife: number; k: number }[];
  };
}

const DATA = path.join(process.cwd(), "data");
const cache = new Map<string, unknown>();

function read<T>(file: string): T | undefined {
  if (cache.has(file)) return cache.get(file) as T;
  const full = path.join(DATA, file);
  if (!fs.existsSync(full)) return undefined;
  const value = JSON.parse(fs.readFileSync(full, "utf8")) as T;
  cache.set(file, value);
  return value;
}

export const getMeta = (): Meta => read<Meta>("meta.json")!;
export const getBacktest = (): Backtest => read<Backtest>("backtest.json")!;
export const getTeam = (slug: string): TeamData | undefined =>
  /^[a-z0-9-]+$/.test(slug) ? read<TeamData>(`teams/${slug}.json`) : undefined;
export const getTeamInfo = (slug: string): TeamInfo | undefined => getMeta().teams.find((t) => t.slug === slug);
export const getForecast = (eventId: number): Forecast | undefined => read<Forecast>(`predictions/${eventId}.json`);
export const getRow = (slug: string): TableRow | undefined => getMeta().table.find((r) => r.team === slug);

export function recordText(r: TableRow | undefined): string {
  return r ? `${r.w}–${r.d}–${r.l}` : "";
}
export function nextMatch(team: TeamData): Match | undefined {
  return team.schedule.filter((m) => !m.played).sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
}
export function lastPlayed(team: TeamData): Match | undefined {
  return team.schedule.filter((m) => m.played).sort((a, b) => b.kickoff.localeCompare(a.kickoff))[0];
}

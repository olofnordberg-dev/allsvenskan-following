"use client";

import { useState } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import type { Format } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";

export interface LogStat {
  key: string;
  label: string;
  format: Format;
  /** Which direction is a good game; null for a tendency. */
  better: "high" | "low" | null;
}

export interface LogGame {
  eventId: number;
  round: number;
  date: string;
  opponent: string;
  oppLogo: string;
  oppColor: string;
  isHome: boolean;
  gf: number;
  ga: number;
  values: Record<string, number | null>;
  /** Opponent's league rank in the matching unit (1 = best, so the toughest). */
  oppRanks: Record<string, number | null>;
}

export interface LogTeam {
  team: string;
  tone: "mine" | "theirs";
  games: LogGame[];
}

const SAMPLES = [
  { key: "l5", label: "L5", n: 5 },
  { key: "l10", label: "L10", n: 10 },
  { key: "all", label: "Season", n: 99 },
];
const VENUES = [
  { key: "all", label: "All" },
  { key: "home", label: "Home" },
  { key: "away", label: "Away" },
];

function fmt(v: number | null, f: LogStat["format"]): string {
  if (v === null) return "–";
  if (f === "int") return String(Math.round(v));
  return formatValue(v, f);
}

function rankClass(rank: number | null): string {
  if (rank === null) return "";
  return rank <= 5 ? "tough" : rank <= 11 ? "mid" : "easy";
}

/**
 * Bar chart of a stat match by match, with a dashed average line and the opponent under each bar,
 * followed by the match log table. Pills pick the stat (and the team), segmented controls the sample.
 */
export function GameLog({ teams, stats, columns }: { teams: LogTeam[]; stats: LogStat[]; columns: string[] }) {
  const [teamIdx, setTeamIdx] = useState(0);
  const [statKey, setStatKey] = useState(stats[0].key);
  const [sample, setSample] = useState("l10");
  const [venue, setVenue] = useState("all");
  const t = teams[teamIdx];
  const stat = stats.find((s) => s.key === statKey)!;

  const byVenue = t.games.filter((g) => venue === "all" || (venue === "home") === g.isHome);
  const n = SAMPLES.find((s) => s.key === sample)!.n;
  const shown = byVenue.slice(-n);
  const vals = shown.map((g) => g.values[stat.key]).filter((v): v is number => v !== null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

  const hi = Math.max(0, ...vals, avg ?? 0);
  const lo = Math.min(0, ...vals, avg ?? 0);
  const span = hi - lo || 1;
  const pct = (v: number) => ((hi - v) / span) * 100; // distance from the top, in %
  const zeroTop = pct(0);
  const sampleLabel = SAMPLES.find((s) => s.key === sample)!.label;

  const judge = (v: number | null) => {
    if (v === null || avg === null || stat.better === null) return "neutral";
    return (stat.better === "high" ? v >= avg : v <= avg) ? "better" : "worse";
  };

  return (
    <div className={`gamelog ${t.tone}`}>
      {teams.length > 1 && (
        <div className={`pills ${t.tone}`} role="group" aria-label="Team">
          {teams.map((x, i) => (
            <button key={x.team} type="button" aria-pressed={i === teamIdx} onClick={() => setTeamIdx(i)}>{x.team}</button>
          ))}
        </div>
      )}
      <div className={`pills ${t.tone}`} role="group" aria-label="Statistic">
        {stats.map((s) => (
          <button key={s.key} type="button" aria-pressed={s.key === statKey} onClick={() => setStatKey(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="gl-controls">
        <div className="segmented" role="group" aria-label="Matches">
          {SAMPLES.map((s) => (
            <button key={s.key} type="button" aria-pressed={s.key === sample} onClick={() => setSample(s.key)}>{s.label}</button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Venue">
          {VENUES.map((v) => (
            <button key={v.key} type="button" aria-pressed={v.key === venue} onClick={() => setVenue(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted small">No matches fit these filters yet.</p>
      ) : (
        <>
          <div className="gl-avg">{sampleLabel} average <b>{fmt(avg, stat.format)}</b></div>
          <div className="gl-chart" role="list" aria-label={`${t.team} ${stat.label} by match`}>
            {lo < 0 && <span className="gl-zero" style={{ top: `${zeroTop}%` }} />}
            {shown.map((g) => {
              const v = g.values[stat.key];
              const positive = (v ?? 0) >= 0;
              const top = v === null ? zeroTop : positive ? pct(v) : zeroTop;
              const height = v === null ? 0 : Math.max(Math.abs(pct(v) - zeroTop), 0.8);
              const desc = `Round ${g.round} ${g.isHome ? "home to" : "away at"} ${g.opponent}: ${stat.label} ${fmt(v, stat.format)}, ${g.gf > g.ga ? "won" : g.gf < g.ga ? "lost" : "drew"} ${g.gf}-${g.ga}`;
              return (
                <div key={g.eventId} className="gl-col" role="listitem" tabIndex={0} title={desc} aria-label={desc}>
                  <div
                    className={`gl-bar ${positive ? "pos" : "neg"} ${judge(v)}${height < 14 ? " short" : ""}`}
                    style={{ top: `${top}%`, height: `${height}%` }}
                  >
                    <span className="gl-val">{fmt(v, stat.format)}</span>
                  </div>
                </div>
              );
            })}
            {avg !== null && (
              <div className="gl-avgline" style={{ top: `${pct(avg)}%` }}>
                <span>{fmt(avg, stat.format)}</span>
              </div>
            )}
          </div>
          <div className="gl-axis" aria-hidden>
            {shown.map((g) => (
              <div key={g.eventId} className="gl-tick">
                <span className="opp">{g.isHome ? "vs" : "@"} <TeamLogo team={g.opponent} src={g.oppLogo} color={g.oppColor} size={20} /></span>
                <span>{g.date}</span>
              </div>
            ))}
          </div>
          <div className="gl-legend">
            {stat.better && <span><i style={{ background: `var(--${t.tone})` }} />Better than the {sampleLabel.toLowerCase()} average</span>}
            {stat.better && <span><i style={{ background: `var(--${t.tone}-deep)` }} />Worse</span>}
            <span><i className="dash" />Average</span>
          </div>

          <div className="table-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th className="left">Opponent</th>
                  <th>Result</th>
                  <th title="The opponent's league rank in the matching unit: red = top 5 (tough), green = bottom 5">Opp. rank</th>
                  <th>{stat.label}</th>
                  {columns.filter((c) => c !== stat.key).map((c) => <th key={c}>{stats.find((s) => s.key === c)?.label}</th>)}
                  <th aria-label="Against the average" />
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((g) => {
                  const v = g.values[stat.key];
                  const j = judge(v);
                  const won = g.gf > g.ga;
                  const lost = g.gf < g.ga;
                  const rank = g.oppRanks[stat.key];
                  return (
                    <tr key={g.eventId}>
                      <td>R{g.round} <span className="rk">{g.date}</span></td>
                      <td className="left">
                        <span className="opp-cell">
                          <span className="muted">{g.isHome ? "vs" : "@"}</span>
                          <TeamLogo team={g.opponent} src={g.oppLogo} color={g.oppColor} size={22} />
                          {g.opponent}
                        </span>
                      </td>
                      <td className="num">
                        <span className={`result ${won ? "w" : lost ? "l" : ""}`}>{won ? "W" : lost ? "L" : "D"}</span> {g.gf}–{g.ga}
                      </td>
                      <td className="num">{rank === null ? "–" : <><i className={`rank-dot ${rankClass(rank)}`} />{ordinal(rank)}</>}</td>
                      <td className="num"><span className="val-pill">{fmt(v, stat.format)}</span></td>
                      {columns.filter((c) => c !== stat.key).map((c) => {
                        const s = stats.find((x) => x.key === c)!;
                        return <td key={c} className="num">{fmt(g.values[c], s.format)}</td>;
                      })}
                      <td>
                        {j !== "neutral" && (
                          <span className={`arrow ${j === "better" ? "up" : "down"}`} title={j === "better" ? "Better than average" : "Worse than average"}>
                            {(stat.better === "high") === (j === "better") ? "↑" : "↓"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

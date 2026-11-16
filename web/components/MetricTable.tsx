import type { Meta, TeamData, Unit } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";

const TITLES: Record<string, string> = {
  results: "Results", scoring: "Scoring", chances: "Chance quality and volume", build_up: "How chances are built",
  conceding: "Conceding", chances_allowed: "Chances allowed", goalkeeping: "Goalkeeping", actions: "Defensive actions",
  for: "Attacking set pieces", against: "Defending set pieces", style: "How they play", discipline: "Discipline",
};

/** Every metric for one unit, grouped by category, beside the league average. */
export function MetricTable({ data, unit, meta }: { data: TeamData; unit: Unit; meta: Meta }) {
  const byCategory = new Map<string, string[]>();
  for (const [name, def] of Object.entries(meta.metrics).sort((a, b) => a[1].order - b[1].order)) {
    if (def.unit !== unit) continue;
    byCategory.set(def.category, [...(byCategory.get(def.category) ?? []), name]);
  }
  return (
    <>
      {[...byCategory.entries()].map(([category, names]) => {
        const tendency = names.every((n) => meta.metrics[n].better === null);
        return (
          <section className="card" key={category}>
            <div className="section-head">
              <h2>{TITLES[category] ?? category}</h2>
              <span className="muted small">
                {tendency ? "Neither good nor bad · rank: 1st = highest of 16" : "Rank: 1st = best of 16 · bar = percentile"}
              </span>
            </div>
            <div className="table-scroll">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Metric</th><th>Season</th><th>Rank</th>
                    <th className="bar-col" aria-label="Percentile" />
                    <th>Last 5</th><th>Home</th><th>Away</th><th>League avg</th>
                  </tr>
                </thead>
                <tbody>
                  {names.map((name) => {
                    const def = meta.metrics[name];
                    const m = data.metrics[name];
                    const s = m?.season;
                    const directional = def.better !== null;
                    const p = Math.round((s?.[2] ?? 0) * 100);
                    return (
                      <tr key={name}>
                        <td>{def.label}</td>
                        <td className="num"><b>{formatValue(s?.[0], def.format)}</b></td>
                        <td className={`num${directional ? "" : " muted"}`}>{ordinal(s?.[1])}</td>
                        <td className="bar-col">
                          {directional && (
                            <div className="bar" role="img" aria-label={`${p}th percentile`} title={`${p}th percentile`}>
                              <i style={{ width: `${p}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="num">{formatValue(m?.last5?.[0], def.format)}</td>
                        <td className="num">{formatValue(m?.home?.[0], def.format)}</td>
                        <td className="num">{formatValue(m?.away?.[0], def.format)}</td>
                        <td className="num muted">{formatValue(meta.leagueAvg.season?.[name], def.format)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

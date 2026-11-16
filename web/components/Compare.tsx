import type { Meta, TeamData } from "@/lib/data";
import { formatValue, ordinal } from "@/lib/format";

/** Percentile bars: one team's metric on the left against the other team's on the right. */
export function Compare({ left, right, rows, meta, leftHead, rightHead }: {
  left: TeamData; right: TeamData; meta: Meta; leftHead: string; rightHead: string;
  rows: { left: string; right: string; label: string }[];
}) {
  return (
    <div className="compare">
      <div className="compare-head"><span>{leftHead}</span><span>Season, rank of 16</span><span>{rightHead}</span></div>
      {rows.map((r) => {
        const a = left.metrics[r.left]?.season;
        const b = right.metrics[r.right]?.season;
        const fa = meta.metrics[r.left].format, fb = meta.metrics[r.right].format;
        const pa = Math.round((a?.[2] ?? 0) * 100), pb = Math.round((b?.[2] ?? 0) * 100);
        return (
          <div className="compare-row" key={r.left + r.right}>
            <div className="side">
              <span className="figure num"><b>{formatValue(a?.[0], fa)}</b> <span className="muted">{ordinal(a?.[1])}</span></span>
              <div className="bar left" role="img" aria-label={`${left.short} ${pa}th percentile`}><i style={{ width: `${pa}%` }} /></div>
            </div>
            <span className="metric">{r.label}</span>
            <div className="side right">
              <div className="bar right" role="img" aria-label={`${right.short} ${pb}th percentile`}><i style={{ width: `${pb}%` }} /></div>
              <span className="figure num"><b>{formatValue(b?.[0], fb)}</b> <span className="muted">{ordinal(b?.[1])}</span></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

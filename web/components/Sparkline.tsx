import type { Format } from "@/lib/data";
import { formatValue } from "@/lib/format";

const W = 150;
const H = 36;
const PAD = 5;

/** Per-match values for one metric: earlier matches in grey, the recent ones in the accent colour. */
export function Sparkline({ series, recent, format, label }: { series: (number | null)[]; recent: number; format: Format; label: string }) {
  const points = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v: number) => (max === min ? H / 2 : H - PAD - ((v - min) * (H - 2 * PAD)) / (max - min));
  const firstRecent = points.length - recent;
  const path = (from: number, to: number) =>
    points.slice(from, to + 1).map((p, i) => `${i ? "L" : "M"}${x(from + i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label} by match, oldest first: ${points.map((p) => formatValue(p.v, format)).join(", ")}`}>
      <path d={path(0, firstRecent)} className="spark-prior" />
      <path d={path(firstRecent, points.length - 1)} className="spark-recent" />
      {points.map((p, i) => (
        <circle key={p.i} cx={x(i)} cy={y(p.v)} r={i >= firstRecent ? 3.5 : 2} className={i >= firstRecent ? "dot-recent" : "dot-prior"}>
          <title>{`Match ${p.i + 1}: ${formatValue(p.v, format)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Minutes per match as small bars; a match not played leaves a tick on the baseline. */
export function MinuteBars({ minutes, starts, recent = 3 }: { minutes: (number | null)[]; starts: boolean[]; recent?: number }) {
  const bw = 5;
  const gap = 1.5;
  const h = 22;
  const width = minutes.length * (bw + gap) - gap;
  return (
    <svg className="spark" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img"
      aria-label={`Minutes by match, oldest first: ${minutes.map((m) => m ?? 0).join(", ")}`}>
      {minutes.map((m, i) => {
        const v = m ?? 0;
        const bh = v === 0 ? 1.5 : Math.max(2, (Math.min(v, 90) / 90) * h);
        return (
          <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={v === 0 ? 0 : 1}
            className={v === 0 ? "bar-missing" : i >= minutes.length - recent ? "bar-recent" : "bar-prior"} opacity={v > 0 && !starts[i] ? 0.55 : undefined}>
            <title>{`Match ${i + 1}: ${v === 0 ? "did not play" : `${v} minutes${starts[i] ? ", started" : ", from the bench"}`}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

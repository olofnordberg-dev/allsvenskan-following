import { pct } from "@/lib/format";

/** Win / draw / loss as one bar. `probs` is given from the first team's side. */
export function ProbBar({ probs, left, right, tone = "mine" }: {
  probs: [number, number, number]; left: string; right: string; tone?: "mine" | "plain";
}) {
  const [a, d, b] = probs;
  return (
    <div className={`probbar ${tone}`} role="img" aria-label={`${left} win ${pct(a)}, draw ${pct(d)}, ${right} win ${pct(b)}`}>
      <div className="pb-track">
        <i className="pb-a" style={{ width: `${a * 100}%` }}><b>{pct(a)}</b></i>
        <i className="pb-d" style={{ width: `${d * 100}%` }}><b>{pct(d)}</b></i>
        <i className="pb-b" style={{ width: `${b * 100}%` }}><b>{pct(b)}</b></i>
      </div>
      <div className="pb-labels"><span>{left}</span><span>Draw</span><span>{right}</span></div>
    </div>
  );
}

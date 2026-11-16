import type { Shot } from "@/lib/data";

// Pitch in metres: 68 wide; the map shows the 44 m nearest the goal.
const PW = 68;
const DEPTH = 44;
const LENGTH = 105;
const KIND: Record<string, string> = { o: "open play", s: "set piece", f: "fast break", p: "penalty" };

/** Every shot as a dot: bigger = better chance (xG), filled = goal. The goal is at the top. */
export function ShotMap({ shots, tone, label }: { shots: Shot[]; tone: "mine" | "theirs"; label: string }) {
  const goals = shots.filter((s) => s[3]).length;
  const xg = shots.reduce((a, s) => a + s[2], 0);
  const sorted = [...shots].sort((a, b) => a[3] - b[3] || b[2] - a[2]);
  return (
    <figure className={`shotmap ${tone}`}>
      <svg viewBox={`-1 -3 ${PW + 2} ${DEPTH + 4}`} role="img" aria-label={`${label}: ${shots.length} shots, ${goals} goals, ${xg.toFixed(1)} xG. Most shots come from inside the box.`}>
        <rect x={0} y={0} width={PW} height={DEPTH} className="sm-pitch" />
        <rect x={(PW - 40.32) / 2} y={0} width={40.32} height={16.5} className="sm-line" />
        <rect x={(PW - 18.32) / 2} y={0} width={18.32} height={5.5} className="sm-line" />
        <rect x={(PW - 7.32) / 2} y={-2} width={7.32} height={2} className="sm-goal" />
        <path d={`M ${PW / 2 - 7.3} 16.5 A 9.15 9.15 0 0 0 ${PW / 2 + 7.3} 16.5`} className="sm-line" />
        <circle cx={PW / 2} cy={11} r={0.35} className="sm-spot" />
        {sorted.map((s, i) => {
          const cx = (s[1] / 100) * PW;
          const cy = Math.min((s[0] / 100) * LENGTH, DEPTH - 0.5);
          return (
            <circle key={i} cx={cx} cy={cy} r={0.55 + Math.sqrt(s[2]) * 1.7} className={s[3] ? "sm-goal-dot" : "sm-shot-dot"}>
              <title>{`${s[3] ? "Goal" : "Shot"}, ${KIND[s[4]] ?? ""}, xG ${s[2].toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="small secondary">
        <b>{label}</b> · {shots.length} shots · {goals} goals · {xg.toFixed(1)} xG
        <span className="sm-key"><i className="k-goal" />goal <i className="k-shot" />no goal · bigger dot = better chance</span>
      </figcaption>
    </figure>
  );
}

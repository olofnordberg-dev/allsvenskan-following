import Link from "next/link";
import type { Absence, TeamData, Unavailable } from "@/lib/data";
import { TeamLogo } from "@/components/TeamLogo";
import { ordinal, pct, POSITION, reasonText, TIER } from "@/lib/format";

const WEIGHT: Record<Absence["label"], { text: string; tone: string }> = {
  light: { text: "Minor", tone: "ok" },
  noticeable: { text: "Noticeable", tone: "mid" },
  heavy: { text: "Heavy", tone: "bad" },
};

function ReturnText({ u }: { u: Unavailable }) {
  if (u.status === "suspended") return <>Back after this match</>;
  if (u.expectedReturn) {
    const d = new Date(u.expectedReturn);
    return <>Back about {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(d)}</>;
  }
  return <>No return date given</>;
}

function Side({ team, absence, players, tone }: { team: TeamData; absence: Absence; players: Unavailable[]; tone: "mine" | "theirs" }) {
  const w = WEIGHT[absence.label];
  const shown = players.filter((u) => u.impactRank !== null || u.status === "suspended" || u.minShare > 0);
  const minor = players.length - shown.length;
  return (
    <div className={`absence-side ${tone}`}>
      <div className="abs-head">
        <TeamLogo team={team.code} src={team.logo} color={team.color} size={30} />
        <h3>{team.short}</h3>
        <span className={`chip abs-${w.tone}`}>{w.text}</span>
      </div>
      <div className="abs-weight">
        <div className={`bar meter ${tone}`} role="img" aria-label={`${pct(absence.weight)} of the core's impact is unavailable`}>
          <i style={{ width: `${Math.min(absence.weight * 100, 100)}%` }} />
          <b className="abs-tick" style={{ left: "10%" }} title="10%: noticeable" />
          <b className="abs-tick" style={{ left: "25%" }} title="25%: heavy" />
        </div>
        <span className="num"><b>{pct(absence.weight)}</b> of core impact out</span>
      </div>
      {players.length === 0 ? (
        <p className="small secondary">No injuries or suspensions reported.</p>
      ) : (
        <ul className="abs-list">
          {shown.map((u) => (
            <li key={u.id}>
              <div className="abs-name">
                <span className="pos" title={POSITION[u.position] ?? ""}>{u.position || "–"}</span> <b>{u.name}</b>
                <span className={`tag tier-${u.tier}`}>{TIER[u.tier]}</span>
              </div>
              <div className="abs-meta small secondary">
                {reasonText(u.status, u.reason)} · <ReturnText u={u} />
              </div>
              <div className="abs-impact">
                <span className="abs-rank num" title="Impact rank in the current squad">
                  {u.impactRank !== null ? <><b>{ordinal(u.impactRank)}</b> of {absence.ranked}</> : "Unranked"}
                </span>
                <div className={`bar meter ${tone}`} role="img" aria-label={`Impact score ${Math.round(u.impact)} of 100`}>
                  <i style={{ width: `${Math.round(u.impact)}%` }} />
                </div>
                <span className="num small">{Math.round(u.impact)}</span>
              </div>
              <div className="abs-stats small muted num">
                {pct(u.minShare)} of minutes · {u.goals} {u.goals === 1 ? "goal" : "goals"} · {u.assists} {u.assists === 1 ? "assist" : "assists"} · {u.npxg.toFixed(1)} npxG
                {u.rating !== null && <> · rating {u.rating.toFixed(1)}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {minor > 0 && <p className="small muted">+ {minor} more without minutes this season.</p>}
    </div>
  );
}

/** Who is out for each side, ranked by impact, with how much of each team's core is missing. */
export function Absences({ me, opp, mine, theirs }: {
  me: TeamData; opp: TeamData; mine: { unavailable: Unavailable[]; absence: Absence }; theirs: { unavailable: Unavailable[]; absence: Absence };
}) {
  const a = mine.absence.weight, b = theirs.absence.weight;
  const diff = Math.abs(a - b);
  const bothLight = mine.absence.label === "light" && theirs.absence.label === "light";
  const summary =
    mine.unavailable.length + theirs.unavailable.length === 0
      ? "Both teams report a clean bill of health."
      : bothLight
        ? `Both teams are close to full strength: ${pct(a)} of core impact is out for ${me.short} and ${pct(b)} for ${opp.short}.`
        : diff < 0.05
          ? `Absences hit both teams about equally (${me.short} ${pct(a)}, ${opp.short} ${pct(b)} of core impact).`
          : `${a > b ? me.short : opp.short} are hit harder: ${pct(Math.max(a, b))} of core impact unavailable against ${pct(Math.min(a, b))} for ${a > b ? opp.short : me.short}.`;
  return (
    <section className="card stack absences">
      <div className="section-head">
        <h2>Unavailable players</h2>
        <span className="muted small">Ranked by how much each team leans on them</span>
      </div>
      <p className="abs-summary">{summary}</p>
      <div className="two-col">
        <Side team={me} absence={mine.absence} players={mine.unavailable} tone="mine" />
        <Side team={opp} absence={theirs.absence} players={theirs.unavailable} tone="theirs" />
      </div>
      <p className="muted small">
        Impact is half the share of the team’s minutes played and half the share of its xG, goals and assists, from 0 to 100; the
        rank is within the current squad. Core impact is the combined impact of the team’s eleven highest-impact players.{" "}
        <Link href="/methods#absences">How it is calculated</Link>
      </p>
    </section>
  );
}

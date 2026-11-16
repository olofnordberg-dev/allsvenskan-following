import Link from "next/link";
import { Kickoff } from "@/components/Kickoff";
import { TeamLogo } from "@/components/TeamLogo";
import { getMeta, getRow, getTeam, getTeamInfo, lastPlayed, nextMatch, recordText } from "@/lib/data";
import { ordinal } from "@/lib/format";

/** Team card: logo, name, record, the next match and the section tabs. */
export function TeamHeader({ team, active }: { team: string; active: string }) {
  const data = getTeam(team)!;
  const meta = getMeta();
  const row = getRow(team);
  const next = nextMatch(data);
  const shown = next ?? lastPlayed(data);
  const opp = shown ? getTeamInfo(shown.opponent) : undefined;
  const tabs = [
    { key: "overview", label: "Overview", path: "" },
    ...(shown ? [{ key: "match", label: next ? "Next match" : "Last match", path: `/match/${shown.eventId}` }] : []),
    { key: "attack", label: "Attack", path: "/attack" },
    { key: "defence", label: "Defence", path: "/defence" },
    { key: "set-pieces", label: "Set pieces", path: "/set-pieces" },
    { key: "style", label: "Style", path: "/style" },
    { key: "players", label: "Players", path: "/players" },
    { key: "trends", label: "Trends", path: "/trends" },
  ];
  return (
    <section className="card team-card">
      <div className="tc-top">
        <TeamLogo team={data.code} src={data.logo} color={data.color} size={72} />
        <div className="tc-title">
          <h1>{data.name}</h1>
          <p>
            {ordinal(data.position)} in Allsvenskan · {row?.pts} points · {recordText(row)} (W–D–L) · {meta.season} season after{" "}
            {row?.played} of 30 matches
          </p>
        </div>
        {next && opp && (
          <Link className="match-chip" href={`/${team}/match/${next.eventId}`} aria-label={`Next match: round ${next.round} ${next.isHome ? "home to" : "away at"} ${opp.name}`}>
            <span className="logos">
              <TeamLogo team={data.code} src={data.logo} color={data.color} size={34} />
              <TeamLogo team={opp.code} src={opp.logo} color={opp.color} size={34} />
            </span>
            <small>Round {next.round} · next match</small>
            <span>
              <b>{next.isHome ? "vs" : "at"} {opp.short}</b>{" "}
              <Kickoff iso={next.kickoff} />
            </span>
          </Link>
        )}
      </div>
      <nav className="pills" aria-label={`${data.name} sections`}>
        {tabs.map((t) => (
          <Link key={t.key} href={`/${team}${t.path}`} aria-current={t.key === active ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

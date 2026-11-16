import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lineup } from "@/components/Lineup";
import { Standings, WithRail } from "@/components/Rail";
import { MinuteBars } from "@/components/Sparkline";
import { TeamHeader } from "@/components/TeamHeader";
import { getForecast, getMeta, getTeam, nextMatch } from "@/lib/data";
import { pct, reasonText } from "@/lib/format";

export function generateStaticParams() {
  return getMeta().teams.map((t) => ({ team: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[team]/players">): Promise<Metadata> {
  const data = getTeam((await params).team);
  return { title: data ? `${data.short} players · Matchplan` : "Matchplan" };
}

const ORDER = ["G", "D", "M", "F", ""];
const GROUP: Record<string, string> = { G: "Goalkeepers", D: "Defenders", M: "Midfielders", F: "Forwards", "": "Other" };

export default async function PlayersPage({ params }: PageProps<"/[team]/players">) {
  const { team } = await params;
  const data = getTeam(team);
  if (!data) notFound();
  const next = nextMatch(data);
  const fc = next && getForecast(next.eventId);
  const side = next?.isHome ? "home" : "away";
  const players = [...data.players].sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.minutes - a.minutes);

  return (
    <WithRail rail={<Standings team={team} />}>
      <main className="stack">
        <TeamHeader team={team} active="players" />

        {fc && next && (
          <section className="card stack">
            <div className="section-head">
              <h2>Likely to feature in round {next.round}</h2>
              <span className="muted small">From recent starts and current availability</span>
            </div>
            <Lineup team={data} forecast={fc.lineups[side]} providerXi={fc.provider.xi[side].players} tone="mine" />
          </section>
        )}

        <section className="card">
          <div className="section-head">
            <h2>Who plays, and how much</h2>
            <span className="muted small">Share of the team’s minutes · bars: one per match, faded = came off the bench, blue = last three</span>
          </div>
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th className="left">Player</th><th>Starts</th><th>Apps</th><th>Minutes share</th><th>Last 5</th>
                  <th className="left">Match by match</th><th>Goals</th><th>Assists</th>
                  <th title="Non-penalty expected goals">npxG</th><th title="Share of the team's shots">Shots share</th>
                  <th title="Share of the team's non-penalty xG">xG share</th><th className="left">Status</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const first = i === 0 || players[i - 1].position !== p.position;
                  const change = p.minShareLast5 - p.minShare;
                  return (
                    <tr key={p.id} className={`${first ? "group-start" : ""} ${p.minutes < 180 ? "thin" : ""}`}>
                      <td className="left"><span className="pos" title={GROUP[p.position]}>{p.position || "–"}</span> {p.name}</td>
                      <td className="num">{p.starts}</td>
                      <td className="num">{p.apps}</td>
                      <td>
                        <div className="share">
                          <div className="bar"><i style={{ width: `${Math.round(p.minShare * 100)}%` }} /></div>
                          <span className="num">{pct(p.minShare)}</span>
                        </div>
                      </td>
                      <td className="num">
                        {pct(p.minShareLast5)}
                        {Math.abs(change) >= 0.2 && <span className={change > 0 ? "up-text" : "down-text"} title="Clearly more or less than over the season"> {change > 0 ? "▲" : "▼"}</span>}
                      </td>
                      <td className="left"><MinuteBars minutes={p.matchMinutes} starts={p.matchStarts} /></td>
                      <td className="num">{p.goals || ""}</td>
                      <td className="num">{p.assists || ""}</td>
                      <td className="num">{p.npxg ? p.npxg.toFixed(1) : ""}</td>
                      <td className="num">{p.shots ? pct(p.shotShare) : ""}</td>
                      <td className="num">{p.npxg ? pct(p.xgShare) : ""}</td>
                      <td className="left">
                        {!p.inSquad ? <span className="muted">Left the squad</span>
                          : p.availability && p.availability !== "available"
                            ? <span className="tag bad">{reasonText(p.availability, p.injury)}</span>
                            : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Greyed rows: under 180 minutes, too little to read much into. npxG is estimated from shot positions (see Methods).
          </p>
        </section>
      </main>
    </WithRail>
  );
}

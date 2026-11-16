import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Standings, WithRail } from "@/components/Rail";
import { Sparkline } from "@/components/Sparkline";
import { TeamHeader } from "@/components/TeamHeader";
import { getMeta, getTeam } from "@/lib/data";
import { formatValue, pct } from "@/lib/format";

export function generateStaticParams() {
  return getMeta().teams.map((t) => ({ team: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[team]/trends">): Promise<Metadata> {
  const data = getTeam((await params).team);
  return { title: data ? `${data.short} trends · Matchplan` : "Matchplan" };
}

const UNIT: Record<string, string> = { attack: "Attack", defence: "Defence", set_pieces: "Set pieces", style: "Style", results: "Results" };

export default async function TrendsPage({ params }: PageProps<"/[team]/trends">) {
  const { team } = await params;
  const data = getTeam(team);
  if (!data) notFound();

  return (
    <WithRail rail={<Standings team={team} />}>
      <main className="stack">
        <TeamHeader team={team} active="trends" />
        <p className="secondary">
          The last three matches against the rest of the season. Something is listed only when the change is bigger than the
          team’s normal match-to-match swings and big enough to matter. Three matches is still a small sample: read these as
          things to watch, not conclusions.
        </p>

        <section className="card">
          <div className="section-head"><h2>Team</h2><span className="muted small">Line: every match this season, last three highlighted</span></div>
          {data.trends.length === 0 ? (
            <p className="muted">Nothing stands out: the last three matches look like the rest of the season.</p>
          ) : (
            <ul className="trend-list">
              {data.trends.map((t) => (
                <li key={t.metric}>
                  <div>
                    <div className="trend-title">
                      <span className={`verdict ${t.verdict === "better" ? "good" : t.verdict === "worse" ? "bad" : ""}`}>
                        {t.verdict === "better" ? "▲ Improving" : t.verdict === "worse" ? "▼ Slipping" : "◆ Shifting"}
                      </span>
                      {t.label} <span className="tag">{UNIT[t.unit]}</span>
                    </div>
                    <div className="trend-detail">
                      Last three: <b>{formatValue(t.recent, t.format)}</b> · before: {formatValue(t.earlier, t.format)}
                    </div>
                  </div>
                  <Sparkline series={t.series} recent={3} format={t.format} label={t.label} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="section-head"><h2>Player usage</h2><span className="muted small">Share of minutes moved by 25 points or more</span></div>
          {data.playerTrends.length === 0 ? (
            <p className="muted">No player’s minutes have changed clearly.</p>
          ) : (
            <ul className="trend-list">
              {data.playerTrends.map((p) => (
                <li key={p.id}>
                  <div>
                    <div className="trend-title">
                      <span className={`verdict ${p.diff > 0 ? "good" : "bad"}`}>{p.diff > 0 ? "▲ More minutes" : "▼ Fewer minutes"}</span>
                      {p.name} <span className="tag">{p.position || "–"}</span>
                      {!p.inSquad ? <span className="tag">left the squad</span> : p.availability && p.availability !== "available" ? <span className="tag bad">{p.availability}</span> : null}
                    </div>
                    <div className="trend-detail">Last three: <b>{pct(p.recent)}</b> of minutes · before: {pct(p.earlier)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </WithRail>
  );
}

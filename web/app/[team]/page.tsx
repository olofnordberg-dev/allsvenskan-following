import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Kickoff } from "@/components/Kickoff";
import { ProbBar } from "@/components/ProbBar";
import { Insights, WithRail } from "@/components/Rail";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { GameLog } from "@/components/charts/GameLog";
import { getForecast, getMeta, getRow, getTeam, getTeamInfo, nextMatch, recordText } from "@/lib/data";
import { formatValue, lower, ordinal } from "@/lib/format";
import { buildGameLog, LOG_COLUMNS, logStats } from "@/lib/gamelog";

export function generateStaticParams() {
  return getMeta().teams.map((t) => ({ team: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[team]">): Promise<Metadata> {
  const info = getTeamInfo((await params).team);
  return { title: info ? `${info.name} · Matchplan` : "Matchplan" };
}

const SNAPSHOT = [
  { metric: "ppg", label: "Results" },
  { metric: "xgd", label: "Underlying play" },
  { metric: "xg", label: "Attack" },
  { metric: "xg_a", label: "Defence" },
  { metric: "sp_xg", label: "Set pieces for" },
  { metric: "sp_xg_a", label: "Set pieces against" },
];

export default async function TeamPage({ params }: PageProps<"/[team]">) {
  const { team } = await params;
  const data = getTeam(team);
  if (!data) notFound();
  const meta = getMeta();
  const next = nextMatch(data);
  const opp = next && getTeamInfo(next.opponent);
  const fc = next && getForecast(next.eventId);
  const mine: [number, number, number] | undefined = fc && (next!.isHome ? fc.probs : [fc.probs[2], fc.probs[1], fc.probs[0]]);

  return (
    <WithRail rail={<Insights team={team} />}>
      <main className="stack">
        <TeamHeader team={team} active="overview" />

        {next && opp ? (
          <section className="card hero">
            <h3>Next match · Round {next.round}</h3>
            <div className="hero-teams">
              <span className="hero-team"><TeamLogo team={data.code} src={data.logo} color={data.color} size={44} />{data.short}</span>
              <span className="hero-at">{next.isHome ? "home to" : "away at"}</span>
              <span className="hero-team">
                <TeamLogo team={opp.code} src={opp.logo} color={opp.color} size={44} />
                {opp.short} <span className="muted small">{ordinal(getRow(opp.slug)?.pos)} · {recordText(getRow(opp.slug))}</span>
              </span>
            </div>
            {mine && fc && (
              <>
                <ProbBar probs={mine} left={`${data.short} win`} right={`${opp.short} win`} />
                <dl className="facts">
                  <div className="fact"><dt>Kick-off</dt><dd><Kickoff iso={next.kickoff} long /></dd></div>
                  <div className="fact"><dt>Expected goals</dt><dd>{data.short} {fc.expGoals[next.isHome ? 0 : 1].toFixed(1)} · {opp.short} {fc.expGoals[next.isHome ? 1 : 0].toFixed(1)}</dd></div>
                  <div className="fact"><dt>Most likely score</dt><dd>{next.isHome ? `${fc.scores[0].home}–${fc.scores[0].away}` : `${fc.scores[0].away}–${fc.scores[0].home}`} ({Math.round(fc.scores[0].p * 100)}%)</dd></div>
                </dl>
              </>
            )}
            <Link className="button" href={`/${team}/match/${next.eventId}`}>Open match preview</Link>
          </section>
        ) : (
          <section className="card">
            <h2>Season finished</h2>
            <p className="secondary" style={{ marginTop: 6 }}>No league match is scheduled. Everything below covers the {meta.season} season.</p>
          </section>
        )}

        <section className="card">
          <div className="section-head">
            <h2>Where {data.short} rank</h2>
            <span className="muted small">League rank of 16, season to date · bar = percentile</span>
          </div>
          <div className="tiles">
            {SNAPSHOT.map(({ metric, label }) => {
              const v = data.metrics[metric]?.season;
              const def = meta.metrics[metric];
              const p = Math.round((v?.[2] ?? 0) * 100);
              return (
                <div className="tile" key={metric}>
                  <span className="label">{label}</span>
                  <span className="rank">{ordinal(v?.[1])}</span>
                  <span className="value">{formatValue(v?.[0], def.format)} {lower(def.label.replace(" per match", ""))}</span>
                  <span className="bar tile-meter" role="img" aria-label={`${p}th percentile`}><i style={{ width: `${p}%` }} /></span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Match log</h2>
            <span className="muted small">Pick a stat; the dashed line is the average for the matches shown</span>
          </div>
          <GameLog teams={[{ team: data.short, tone: "mine", games: buildGameLog(team) }]} stats={logStats()} columns={LOG_COLUMNS} />
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Fixtures and results</h2>
            <span className="muted small">Times in your time zone</span>
          </div>
          <div className="schedule">
            {data.schedule.map((g) => {
              const o = getTeamInfo(g.opponent);
              const won = g.played && g.gf! > g.ga!;
              const lost = g.played && g.gf! < g.ga!;
              const row = (
                <>
                  <span className="muted small">R{g.round}</span>
                  <span className="game-opp">
                    {o && <TeamLogo team={o.code} src={o.logo} color={o.color} size={28} />}
                    <span className="name"><span className="muted">{g.isHome ? "vs" : "at"}</span> {o?.name ?? g.opponent}</span>
                    {g === next && <span className="tag">Next</span>}
                  </span>
                  <span className="game-meta">
                    {g.played ? (
                      <span className="num">
                        <span className={`result ${won ? "w" : lost ? "l" : ""}`}>{won ? "W" : lost ? "L" : "D"}</span> {g.gf}–{g.ga}
                        {g.xgf !== null && <span className="muted"> · xG {g.xgf.toFixed(1)}–{g.xga!.toFixed(1)}</span>}
                      </span>
                    ) : (
                      <Kickoff iso={g.kickoff} />
                    )}
                  </span>
                </>
              );
              return g.played ? (
                <div key={g.eventId} className="game-row">{row}</div>
              ) : (
                <Link key={g.eventId} href={`/${team}/match/${g.eventId}`} className={`game-row${g === next ? " next" : ""}`}>{row}</Link>
              );
            })}
          </div>
        </section>
      </main>
    </WithRail>
  );
}

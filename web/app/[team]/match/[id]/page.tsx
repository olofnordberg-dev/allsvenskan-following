import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Compare } from "@/components/Compare";
import { Kickoff } from "@/components/Kickoff";
import { Lineup } from "@/components/Lineup";
import { ProbBar } from "@/components/ProbBar";
import { Standings, WithRail } from "@/components/Rail";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { getForecast, getMeta, getRow, getTeam, lastPlayed, type TeamData } from "@/lib/data";
import { formatValue, ordinal, pct } from "@/lib/format";
import { keysToTheMatch, PAIRS } from "@/lib/matchup";

export function generateStaticParams() {
  // Every match still to play, plus each team's latest result so the route always has a page.
  return getMeta().teams.flatMap((t) => {
    const data = getTeam(t.slug)!;
    const last = lastPlayed(data);
    return [...data.schedule.filter((m) => !m.played), ...(last ? [last] : [])].map((m) => ({ team: t.slug, id: String(m.eventId) }));
  });
}

export async function generateMetadata({ params }: PageProps<"/[team]/match/[id]">): Promise<Metadata> {
  const { team, id } = await params;
  const data = getTeam(team);
  const m = data?.schedule.find((x) => String(x.eventId) === id);
  const opp = m && getTeam(m.opponent);
  return { title: data && opp ? `${data.short} ${m!.isHome ? "vs" : "at"} ${opp.short} · Matchplan` : "Matchplan" };
}

const STYLE = ["possession", "pass_acc", "long_ball_share", "directness", "pressing", "crosses", "fb_shots", "fouls"];
const TEND: Record<string, string> = { possession: "Possession", shots: "Shots", xg: "xG", corners: "Corners" };

function Recent({ t }: { t: TeamData }) {
  const games = t.schedule.filter((m) => m.played).slice(-5).reverse();
  return (
    <div>
      <h3>{t.short} · last five</h3>
      <ul className="plain-list">
        {games.map((g) => {
          const o = getTeam(g.opponent)!;
          const r = g.gf! > g.ga! ? "W" : g.gf! < g.ga! ? "L" : "D";
          return (
            <li key={g.eventId} className="num">
              <span className={`result ${r === "W" ? "w" : r === "L" ? "l" : ""}`}>{r}</span> {g.gf}–{g.ga}{" "}
              <span className="secondary">{g.isHome ? "vs" : "at"} {o.short}</span>
              {g.xgf !== null && <span className="muted small"> · xG {g.xgf.toFixed(1)}–{g.xga!.toFixed(1)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default async function MatchPage({ params }: PageProps<"/[team]/match/[id]">) {
  const { team, id } = await params;
  const me = getTeam(team);
  const match = me?.schedule.find((m) => String(m.eventId) === id);
  const opp = match && getTeam(match.opponent);
  if (!me || !match || !opp) notFound();
  const meta = getMeta();
  const fc = getForecast(match.eventId);
  const flip = <T,>(x: [T, T, T]): [T, T, T] => (match.isHome ? x : [x[2], x[1], x[0]]);
  const mySide = match.isHome ? "home" : "away";
  const oppSide = match.isHome ? "away" : "home";
  const keys = keysToTheMatch(me, opp, meta, fc, match.isHome);
  const earlier = me.schedule.find((m) => m.played && m.opponent === opp.slug && m.eventId !== match.eventId);
  const label = (m: string) => meta.metrics[m].label;

  return (
    <WithRail rail={<Standings team={team} />}>
      <main className="stack">
        <TeamHeader team={team} active="match" />

        <section className="card stack">
          <div className="mh-title">
            <span className="mh-logos">
              <TeamLogo team={me.code} src={me.logo} color={me.color} size={52} />
              <TeamLogo team={opp.code} src={opp.logo} color={opp.color} size={52} />
            </span>
            <h1>{me.short}<span className="at">{match.isHome ? "vs" : "at"}</span>{opp.short}</h1>
          </div>
          <p className="secondary">
            Round {match.round} · <Kickoff iso={match.kickoff} long /> · {match.isHome ? `home for ${me.short}` : `away at ${opp.short}`} ·{" "}
            {opp.short} are {ordinal(opp.position)} ({getRow(opp.slug)?.pts} pts), {me.short} {ordinal(me.position)} ({getRow(me.slug)?.pts} pts)
          </p>
          {match.played && (
            <p><b>Played: {me.short} {match.gf}–{match.ga} {opp.short}</b>
              {match.xgf !== null && <span className="secondary"> · xG {match.xgf.toFixed(2)}–{match.xga!.toFixed(2)}</span>}
              <span className="muted small"> · the comparison below uses the season to date, including this match.</span></p>
          )}
          {earlier && (
            <p className="small secondary">Earlier this season: {me.short} {earlier.gf}–{earlier.ga} {opp.short} ({earlier.isHome ? "home" : "away"}, round {earlier.round}).</p>
          )}
        </section>

        {fc && (
          <section className="card stack">
            <div className="section-head">
              <h2>What to expect</h2>
              <Link className="small" href="/methods">How good are these forecasts?</Link>
            </div>
            <ProbBar probs={flip(fc.probs)} left={`${me.short} win`} right={`${opp.short} win`} />
            <div className="table-scroll">
              <table className="forecast-table">
                <thead><tr><th>Source</th><th>{me.short} win</th><th>Draw</th><th>{opp.short} win</th></tr></thead>
                <tbody>
                  <tr className="best-row"><td>This app’s model</td>{flip(fc.probs).map((p, i) => <td key={i} className="num">{pct(p)}</td>)}</tr>
                  {fc.odds && <tr><td>Bookmakers <span className="muted small">(odds {flip([fc.odds.home, fc.odds.draw, fc.odds.away]).map((o) => o.toFixed(2)).join(" / ")}, margin removed)</span></td>{flip(fc.odds.implied).map((p, i) => <td key={i} className="num">{pct(p)}</td>)}</tr>}
                  {fc.provider.probs && <tr><td>Data provider’s model</td>{flip(fc.provider.probs).map((p, i) => <td key={i} className="num">{pct(p)}</td>)}</tr>}
                </tbody>
              </table>
            </div>
            <dl className="facts">
              <div className="fact"><dt>Expected goals</dt><dd>{me.short} {fc.expGoals[match.isHome ? 0 : 1].toFixed(2)} · {opp.short} {fc.expGoals[match.isHome ? 1 : 0].toFixed(2)}</dd></div>
              <div className="fact"><dt>Likeliest scores ({me.short} first)</dt><dd>{fc.scores.slice(0, 4).map((s) => `${match.isHome ? s.home : s.away}–${match.isHome ? s.away : s.home} (${Math.round(s.p * 100)}%)`).join(" · ")}</dd></div>
              <div className="fact"><dt>Over 2.5 goals</dt><dd>{pct(fc.over25)}</dd></div>
              <div className="fact"><dt>Both teams score</dt><dd>{pct(fc.btts)}</dd></div>
            </dl>
            <div className="table-scroll">
              <table className="forecast-table">
                <thead><tr><th>Expected in this match</th><th>{me.short}</th><th>{opp.short}</th><th>League avg</th></tr></thead>
                <tbody>
                  {Object.entries(fc.tendencies).map(([k, t]) => (
                    <tr key={k}>
                      <td>{TEND[k] ?? k}</td>
                      <td className="num"><b>{k === "possession" ? `${Math.round(t[mySide])}%` : t[mySide].toFixed(k === "xg" ? 2 : 1)}</b></td>
                      <td className="num"><b>{k === "possession" ? `${Math.round(t[oppSide])}%` : t[oppSide].toFixed(k === "xg" ? 2 : 1)}</b></td>
                      <td className="num muted">{k === "possession" ? `${Math.round(t.league)}%` : t.league.toFixed(k === "xg" ? 2 : 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="card gameplan">
          <h3>Keys to the match</h3>
          <div className="two-col" style={{ marginTop: 10 }}>
            <div className="gp-col">
              <h3><TeamLogo team={me.code} src={me.logo} color={me.color} size={22} /> For {me.short}</h3>
              <ul className="gp-list">
                {keys.mine.map((k, i) => (
                  <li key={i}><span className={`gp-kind ${k.kind}`}>{k.kind === "edge" ? "▲" : k.kind === "risk" ? "▼" : "●"}</span><span>{k.text}</span></li>
                ))}
              </ul>
            </div>
            <div className="gp-col">
              <h3><TeamLogo team={opp.code} src={opp.logo} color={opp.color} size={22} /> How {opp.short} will see it</h3>
              <ul className="gp-list">
                {keys.theirs.length === 0 && <li><span className="gp-kind">●</span><span>No clear mismatch in either direction: the two teams’ strengths and weaknesses line up closely.</span></li>}
                {keys.theirs.map((k, i) => (
                  <li key={i}><span className={`gp-kind ${k.kind}`}>{k.kind === "edge" ? "▲" : "▼"}</span><span>{k.text}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>▲ advantage · ▼ risk · written from the season numbers below, not by hand.</p>
        </section>

        <section className="card stack">
          <div className="section-head">
            <h2>{me.short} attack against {opp.short} defence</h2>
            <span className="legend"><span><i className="swatch mine" />{me.short} create</span><span><i className="swatch theirs" />{opp.short} allow (longer bar = better defence)</span></span>
          </div>
          <Compare left={me} right={opp} meta={meta} leftHead={`${me.short} attack`} rightHead={`${opp.short} defence`}
            rows={PAIRS.map((p) => ({ left: p.attack, right: p.defence, label: p.label }))} />
        </section>

        <section className="card stack">
          <div className="section-head">
            <h2>{opp.short} attack against {me.short} defence</h2>
            <span className="legend"><span><i className="swatch mine" />{me.short} allow (longer bar = better defence)</span><span><i className="swatch theirs" />{opp.short} create</span></span>
          </div>
          <Compare left={me} right={opp} meta={meta} leftHead={`${me.short} defence`} rightHead={`${opp.short} attack`}
            rows={PAIRS.map((p) => ({ left: p.defence, right: p.attack, label: p.label }))} />
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Style</h2>
            <span className="muted small">Tendencies, neither good nor bad · rank: 1st = highest of 16</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Tendency</th><th>{me.short}</th><th>Rank</th><th>{opp.short}</th><th>Rank</th><th>League avg</th></tr></thead>
              <tbody>
                {STYLE.map((m) => {
                  const a = me.metrics[m]?.season, b = opp.metrics[m]?.season, f = meta.metrics[m].format;
                  return (
                    <tr key={m}>
                      <td>{label(m)}</td>
                      <td className="num"><b>{formatValue(a?.[0], f)}</b></td><td className="num muted">{ordinal(a?.[1])}</td>
                      <td className="num"><b>{formatValue(b?.[0], f)}</b></td><td className="num muted">{ordinal(b?.[1])}</td>
                      <td className="num muted">{formatValue(meta.leagueAvg.season[m], f)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>Opponent passes per defensive action: lower means the team presses more.</p>
        </section>

        {fc && (
          <section className="card stack">
            <div className="section-head">
              <h2>Expected line-ups</h2>
              <span className="muted small">From recent starts and current injuries and suspensions; confirmed line-ups come about an hour before kick-off</span>
            </div>
            <div className="two-col">
              <Lineup team={me} forecast={fc.lineups[mySide]} providerXi={fc.provider.xi[mySide].players} tone="mine" />
              <Lineup team={opp} forecast={fc.lineups[oppSide]} providerXi={fc.provider.xi[oppSide].players} tone="theirs" />
            </div>
          </section>
        )}

        <section className="card two-col">
          <Recent t={me} />
          <Recent t={opp} />
        </section>
        <p className="small"><Link href={`/${opp.slug}`}>Open {opp.name}’s pages</Link></p>
      </main>
    </WithRail>
  );
}

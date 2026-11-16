import Link from "next/link";
import type { ReactNode } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import { getMeta, getTeam, getTeamInfo } from "@/lib/data";
import { formatValue, reasonText } from "@/lib/format";

export function WithRail({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="with-rail">
      {children}
      <aside className="rail">{rail}</aside>
    </div>
  );
}

/** League table with the selected team highlighted. */
export function Standings({ team }: { team: string }) {
  const meta = getMeta();
  return (
    <section className="card rail-card">
      <h2>Table</h2>
      <table className="standings">
        <thead>
          <tr><th>Team</th><th title="Played">P</th><th title="Goal difference">GD</th><th title="xG difference">xGD</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {meta.table.map((r) => {
            const t = getTeamInfo(r.team)!;
            return (
              <tr key={r.team} className={`${r.team === team ? "me" : ""} ${r.zoneType ?? ""}`}>
                <td>
                  <Link href={`/${r.team}`} className="st-team">
                    <span className="muted num st-pos">{r.pos}</span>
                    <TeamLogo team={t.code} src={t.logo} color={t.color} size={18} />
                    {t.short}
                  </Link>
                </td>
                <td className="num">{r.played}</td>
                <td className="num">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
                <td className="num muted">{r.xgf - r.xga > 0 ? "+" : ""}{(r.xgf - r.xga).toFixed(1)}</td>
                <td className="num"><b>{r.pts}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small st-note">Blue edge: European qualification places. Red edge: relegation zone.</p>
    </section>
  );
}

/** The clearest recent changes for the team, as short cards. */
export function Insights({ team }: { team: string }) {
  const data = getTeam(team)!;
  const out = data.players.filter((p) => p.inSquad && p.availability && p.availability !== "available" && p.minShare > 0.15);
  return (
    <>
      <section className="card rail-card">
        <h2>What is changing</h2>
        {data.trends.length === 0 && <p className="muted small">Nothing in the last three matches stands out from the rest of the season.</p>}
        {data.trends.slice(0, 4).map((t) => (
          <div className="insight" key={t.metric}>
            <div className="insight-head">
              <b>{t.label}</b>
              <span />
              <span className={`chip ${t.verdict === "better" ? "good" : t.verdict === "worse" ? "bad" : ""}`}>
                {t.verdict === "better" ? "Improving" : t.verdict === "worse" ? "Slipping" : "Shifting"}
              </span>
            </div>
            <p>
              {formatValue(t.recent, t.format)} over the last three matches, {formatValue(t.earlier, t.format)} before.
            </p>
          </div>
        ))}
        <p className="small" style={{ marginTop: 10 }}><Link href={`/${team}/trends`}>All trends</Link></p>
      </section>
      {out.length > 0 && (
        <section className="card rail-card">
          <h2>Unavailable</h2>
          <ul className="plain-list">
            {out.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b>
                <span className="muted small"> · {reasonText(p.availability, p.injury)} · played {Math.round(p.minShare * 100)}% of minutes</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Standings team={team} />
    </>
  );
}

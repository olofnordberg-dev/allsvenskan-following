import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricTable } from "@/components/MetricTable";
import { Standings, WithRail } from "@/components/Rail";
import { ShotMap } from "@/components/ShotMap";
import { TeamHeader } from "@/components/TeamHeader";
import { getMeta, getTeam, type Meta, type ShotAgg, type ShotGroups, type TeamData, type Unit } from "@/lib/data";

const UNITS: Record<string, { unit: Unit; title: string; intro: string }> = {
  attack: { unit: "attack", title: "Attack", intro: "How many chances they create, how good the chances are and how they are built." },
  defence: { unit: "defence", title: "Defence", intro: "What opponents manage to create against them." },
  "set-pieces": { unit: "set_pieces", title: "Set pieces", intro: "Corners, free kicks and throw-ins, for and against. Penalties are counted separately." },
  style: { unit: "style", title: "Style", intro: "Tendencies: how they choose to play. None of these is good or bad in itself." },
};

export function generateStaticParams() {
  return getMeta().teams.flatMap((t) => Object.keys(UNITS).map((unit) => ({ team: t.slug, unit })));
}

export async function generateMetadata({ params }: PageProps<"/[team]/[unit]">): Promise<Metadata> {
  const { team, unit } = await params;
  const data = getTeam(team);
  return { title: data && UNITS[unit] ? `${data.short} ${UNITS[unit].title.toLowerCase()} · Matchplan` : "Matchplan" };
}

const GROUP_LABEL: Record<string, string> = { open_play: "Open play", fast_break: "Fast breaks", set_piece: "Set pieces", penalty: "Penalties" };
const ZONE_LABEL: Record<string, string> = { six: "Six-yard box", box: "Rest of the penalty area", out: "Outside the area" };
const SIT_LABEL: Record<string, string> = { corner: "Corners", "free-kick": "Direct free kicks", "set-piece": "Free-kick deliveries", "throw-in-set-piece": "Throw-ins" };
const BAND_LABEL = ["1–15", "16–30", "31–45+", "46–60", "61–75", "76–90+"];

function ShotTable({ title, note, rows, mine, league, n }: {
  title: string; note: string; rows: [string, string][]; mine: Record<string, ShotAgg>; league: Record<string, ShotAgg>; n: number;
}) {
  const total = Object.values(mine).reduce((a, v) => a + v[0], 0) || 1;
  return (
    <section className="card">
      <div className="section-head"><h2>{title}</h2><span className="muted small">{note}</span></div>
      <div className="table-scroll">
        <table>
          <thead><tr><th /><th>Shots / match</th><th>Share</th><th>xG / match</th><th>League xG</th><th>Goals</th><th>xG per shot</th></tr></thead>
          <tbody>
            {rows.map(([key, label]) => {
              const v = mine[key] ?? [0, 0, 0];
              const l = league[key] ?? [0, 0, 0];
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{(v[0] / n).toFixed(1)}</td>
                  <td className="num muted">{Math.round((v[0] / total) * 100)}%</td>
                  <td className="num"><b>{(v[1] / n).toFixed(2)}</b></td>
                  <td className="num muted">{l[1].toFixed(2)}</td>
                  <td className="num">{v[2]}</td>
                  <td className="num">{v[0] ? (v[1] / v[0]).toFixed(2) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Situations({ data, meta, side }: { data: TeamData; meta: Meta; side: "for" | "against" }) {
  const g: ShotGroups = data.splits[side];
  const n = data.games.length || 1;
  const who = side === "for" ? "Their own shots" : "Opponents’ shots";
  return (
    <>
      <ShotTable title={side === "for" ? "Where the chances come from" : "How opponents get their chances"} note={`${who} by type of attack`}
        rows={Object.entries(GROUP_LABEL)} mine={g.group} league={meta.leagueShots.group} n={n} />
      <ShotTable title="Shot locations" note={`${who} by distance`} rows={Object.entries(ZONE_LABEL)} mine={g.zone} league={meta.leagueShots.zone} n={n} />
      <ShotTable title="When in the match" note={`${who} by 15-minute period`} rows={BAND_LABEL.map((l, i) => [String(i), l])} mine={g.band} league={meta.leagueShots.band} n={n} />
    </>
  );
}

function GameState({ data }: { data: TeamData }) {
  const s = data.splits.state;
  const rows: ["lead" | "level" | "trail", string][] = [["lead", "Ahead"], ["level", "Level"], ["trail", "Behind"]];
  const h = data.splits.halves;
  return (
    <section className="card two-col">
      <div>
        <div className="section-head"><h2>By game state</h2></div>
        <div className="table-scroll"><table>
          <thead><tr><th /><th>Share of minutes</th><th>League</th><th>xG for / 90</th><th>xG against / 90</th></tr></thead>
          <tbody>
            {rows.map(([k, label]) => (
              <tr key={k} className={s[k].share < 0.12 ? "thin" : ""}>
                <td>{label}</td>
                <td className="num"><b>{Math.round(s[k].share * 100)}%</b></td>
                <td className="num muted">{Math.round(s[k].leagueShare * 100)}%</td>
                <td className="num">{s[k].xgf90?.toFixed(2) ?? "–"}</td>
                <td className="num">{s[k].xga90?.toFixed(2) ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted small" style={{ marginTop: 8 }}>League xG per 90 is about {s.level.leagueXg90.toFixed(2)} in every state. Greyed rows rest on few minutes.</p>
      </div>
      <div>
        <div className="section-head"><h2>By half</h2></div>
        <div className="table-scroll"><table>
          <thead><tr><th /><th>Goals for</th><th>Goals against</th><th>xG for</th><th>xG against</th><th>League xG</th></tr></thead>
          <tbody>
            {(["1h", "2h"] as const).map((k) => (
              <tr key={k}>
                <td>{k === "1h" ? "First half" : "Second half"}</td>
                <td className="num"><b>{h[k].gf.toFixed(2)}</b></td>
                <td className="num"><b>{h[k].ga.toFixed(2)}</b></td>
                <td className="num">{h[k].xgf.toFixed(2)}</td>
                <td className="num">{h[k].xga.toFixed(2)}</td>
                <td className="num muted">{h[k].leagueXg.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted small" style={{ marginTop: 8 }}>Per match.</p>
      </div>
    </section>
  );
}

export default async function UnitPage({ params }: PageProps<"/[team]/[unit]">) {
  const { team, unit } = await params;
  const data = getTeam(team);
  const u = UNITS[unit];
  if (!data || !u) notFound();
  const meta = getMeta();
  const n = data.games.length || 1;
  const formations = Object.entries(data.formations).sort((a, b) => b[1] - a[1]);

  return (
    <WithRail rail={<Standings team={team} />}>
      <main className="stack">
        <TeamHeader team={team} active={unit} />
        <p className="secondary">{u.intro} Every number sits beside the league average; “last 5” is the five most recent matches.</p>

        {unit === "attack" && <section className="card"><ShotMap shots={data.shots.for} tone="mine" label={`${data.short} shots this season`} /></section>}
        {unit === "defence" && <section className="card"><ShotMap shots={data.shots.against} tone="theirs" label={`Shots against ${data.short} this season`} /></section>}

        <MetricTable data={data} unit={u.unit} meta={meta} />

        {unit === "attack" && <><Situations data={data} meta={meta} side="for" /><GameState data={data} /></>}
        {unit === "defence" && <><Situations data={data} meta={meta} side="against" /><GameState data={data} /></>}
        {unit === "set-pieces" && (
          <>
            <ShotTable title="Attacking set pieces by type" note="Their own shots" rows={Object.entries(SIT_LABEL)} mine={data.splits.for.situation} league={meta.leagueShots.situation} n={n} />
            <ShotTable title="Defending set pieces by type" note="Opponents’ shots" rows={Object.entries(SIT_LABEL)} mine={data.splits.against.situation} league={meta.leagueShots.situation} n={n} />
            <section className="card two-col">
              <ShotMap shots={data.shots.for.filter((s) => s[4] === "s")} tone="mine" label="Set-piece shots for" />
              <ShotMap shots={data.shots.against.filter((s) => s[4] === "s")} tone="theirs" label="Set-piece shots against" />
            </section>
          </>
        )}
        {unit === "style" && (
          <>
            <section className="card">
              <div className="section-head"><h2>Formations</h2><span className="muted small">Starting formation, matches this season</span></div>
              <p>
                {formations.map(([f, c]) => `${f} (${c})`).join(" · ") || "No line-up data yet."}
                {data.manager?.name && <span className="secondary"> · Head coach {data.manager.name}</span>}
              </p>
              <p className="small secondary" style={{ marginTop: 6 }}>
                Last five: {data.schedule.filter((m) => m.played && m.formation).slice(-5).map((m) => m.formation).join(" → ")}
              </p>
            </section>
            <GameState data={data} />
          </>
        )}
      </main>
    </WithRail>
  );
}

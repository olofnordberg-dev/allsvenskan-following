import type { LineupForecast, TeamData } from "@/lib/data";
import { POSITION, reasonText } from "@/lib/format";

/** Expected starters with how regularly each has started lately, then who is out. */
export function Lineup({ team, forecast, providerXi, tone, showUnavailable = true }: {
  team: TeamData; forecast: LineupForecast; providerXi: number[]; tone: "mine" | "theirs"; showUnavailable?: boolean;
}) {
  const order = ["G", "D", "M", "F", ""];
  const eleven = forecast.players.filter((p) => p.inEleven).sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position));
  const bench = forecast.players.filter((p) => !p.inEleven);
  const agree = eleven.filter((p) => providerXi.includes(p.id)).length;
  return (
    <div className={`lineup ${tone}`}>
      <h3>{team.short}{team.manager?.preferredFormation ? ` · usually ${team.manager.preferredFormation}` : ""}</h3>
      <div className="table-scroll"><table className="lineup-table">
        <thead><tr><th>Expected eleven</th><th title="Recency-weighted share of recent matches started">Recent starts</th><th>Exp. minutes</th></tr></thead>
        <tbody>
          {eleven.map((p) => (
            <tr key={p.id}>
              <td><span className="pos" title={POSITION[p.position] ?? ""}>{p.position || "–"}</span> {p.name}</td>
              <td>
                <div className="share">
                  <div className={`bar meter ${tone}`}><i style={{ width: `${Math.round(p.startScore * 100)}%` }} /></div>
                  <span className="num">{Math.round(p.startScore * 100)}%</span>
                </div>
              </td>
              <td className="num">{Math.round(p.expMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {bench.length > 0 && (
        <p className="small secondary"><b>Next in line:</b> {bench.map((p) => `${p.name} (${Math.round(p.startScore * 100)}%)`).join(", ")}</p>
      )}
      {showUnavailable && forecast.unavailable.length > 0 && (
        <p className="small secondary">
          <b>Unavailable:</b>{" "}
          {forecast.unavailable.map((u) => `${u.name} (${reasonText(u.status, u.reason)})`).join(", ")}
        </p>
      )}
      {providerXi.length > 0 && (
        <p className="small muted">{agree} of these 11 are also in the data provider’s own predicted line-up.</p>
      )}
    </div>
  );
}

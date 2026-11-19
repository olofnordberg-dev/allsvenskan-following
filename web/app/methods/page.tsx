import type { Metadata } from "next";
import { getBacktest, getMeta } from "@/lib/data";

export const metadata: Metadata = { title: "Methods · Matchplan" };

export default function MethodsPage() {
  const meta = getMeta();
  const bt = getBacktest();
  const r = bt.result;
  const model = r.rows[0];
  const built = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(meta.builtAt));
  const best = (rows: { logLoss: number }[], x: { logLoss: number }) => Math.min(...rows.map((y) => y.logLoss)) === x.logLoss;

  return (
    <main className="stack prose">
      <h1>Methods</h1>
      <p className="secondary">
        What the numbers are, where they come from and how far to trust the forecasts. Data last refreshed {built} (Swedish time),
        covering {meta.matchesPlayed} of {meta.matchesTotal} matches of the {meta.season} season.
      </p>

      <section className="card stack">
        <h2>Data</h2>
        <p>
          Everything comes from one free source, the Bzzoiro Sports Data API: results, team statistics, shot locations,
          line-ups, minutes, cards, injuries and suspensions, and bookmaker odds. It is not official league data.
        </p>
        <p>
          <b>xG is estimated.</b> {meta.xgEstimatedShare !== null && meta.xgEstimatedShare > 0.99 ? "Every" : `${Math.round((meta.xgEstimatedShare ?? 0) * 100)}% of`} shot
          this season carries an xG value that the data provider estimates from where and how the shot was taken, rather than
          a value from a tracking-based xG model. It is good enough to compare teams and to separate good chances from poor
          ones, but single-match figures are rough. Penalties are counted apart in “non-penalty xG”.
        </p>
        <p>
          <b>Ranks</b> are out of 16. 1st is best where a direction exists. For tendencies such as possession, 1st just means
          highest. <b>Last 5</b> is the five most recent league matches; treat it as a small sample.
        </p>
        <p>
          <b>Injuries and suspensions</b> are the provider’s current list and can lag the clubs’ own announcements.
        </p>
      </section>

      <section className="card stack">
        <h2>Match result forecast</h2>
        <p>
          Each team gets an attack and a defence strength from its results{r.params.xg_w > 0 ? " and xG" : ""} over the last four seasons,
          with recent matches counting more (a match {r.params.half_life} days old counts half) and a home advantage. The strengths
          give expected goals for each side, and from those the chance of every score.
        </p>
        <p>
          The settings were chosen on the {r.tuneSeason} season and then scored on {r.testSeason} without further changes. Before each
          match day the model only saw earlier matches. Lower log loss and ranked probability score are better; a forecast that
          knew nothing would score about 1.10 on log loss.
        </p>
        <div className="table-scroll">
          <table className="forecast-table">
            <thead><tr><th>{r.testSeason} season, {model.n} matches</th><th>Log loss</th><th>Ranked prob. score</th><th>Picked the result</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.name} className={best(r.rows, x) ? "best-row" : ""}>
                  <td>{x.name}</td><td className="num">{x.logLoss.toFixed(3)}</td><td className="num">{x.rps.toFixed(3)}</td><td className="num">{Math.round(x.accuracy * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.oddsSubset && (
          <>
            <p>Against the bookmakers, on the {r.oddsSubset[0].n} matches that have odds in the data:</p>
            <div className="table-scroll">
              <table className="forecast-table">
                <thead><tr><th>Same matches</th><th>Log loss</th><th>Ranked prob. score</th><th>Picked the result</th></tr></thead>
                <tbody>
                  {r.oddsSubset.map((x) => (
                    <tr key={x.name} className={best(r.oddsSubset!, x) ? "best-row" : ""}>
                      <td>{x.name}</td><td className="num">{x.logLoss.toFixed(3)}</td><td className="num">{x.rps.toFixed(3)}</td><td className="num">{Math.round(x.accuracy * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="secondary">
              {r.oddsSubset[0].logLoss < r.oddsSubset[1].logLoss
                ? "The bookmakers are clearly better: they know about line-ups, injuries and news that this model does not. When the two disagree, trust the odds."
                : "The model matched the bookmakers on this sample, which is more likely luck than skill."}
            </p>
          </>
        )}
        <h3>Do the percentages mean what they say?</h3>
        <div className="table-scroll">
          <table className="forecast-table">
            <thead><tr><th>Home win forecast</th><th>Matches</th><th>Average forecast</th><th>Home team actually won</th></tr></thead>
            <tbody>
              {r.calibration.map((c) => (
                <tr key={c.bin}><td>{c.bin.replace(/[(\]]/g, "").split(", ").map((x) => `${Math.round(Number(x) * 100)}%`).join(" to ")}</td><td className="num">{c.n}</td><td className="num">{Math.round(c.predicted * 100)}%</td><td className="num">{Math.round(c.actual * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="secondary">With 30 to 60 matches per row, differences of ten points either way are within chance.</p>
      </section>

      <section className="card stack">
        <h2>Line-up forecast</h2>
        <p>
          A player’s chance of starting is his share of recent starts, with the latest match counting most, and players listed as
          injured or suspended removed. Scored on {bt.lineups.n} team line-ups in {bt.lineups.testSeason}: how many of the eleven
          named starters were right.
        </p>
        <div className="table-scroll">
          <table className="forecast-table">
            <thead><tr><th>Method</th><th>Correct starters out of 11</th></tr></thead>
            <tbody>
              {bt.lineups.rows.map((x) => (
                <tr key={x.name} className={Math.max(...bt.lineups.rows.map((y) => y.correct)) === x.correct ? "best-row" : ""}>
                  <td>{x.name}</td><td className="num">{x.correct.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="secondary">
          The gain over simply repeating the last eleven is small, and comes from knowing who is unavailable. Expect about two
          of the eleven to be wrong in a typical match.
        </p>
      </section>

      <section className="card stack">
        <h2>Expected possession, shots, xG and corners</h2>
        <p>
          Each team’s recent numbers (recent matches weighted more, pulled toward the league average when there are few) are
          combined with what the opponent usually allows. Scored on {bt.tendencies.testSeason} as the average miss per team per match.
        </p>
        <div className="table-scroll">
          <table className="forecast-table">
            <thead><tr><th>Average miss</th><th>This app</th><th>Team’s season average</th><th>League average</th><th>Gain over team average</th></tr></thead>
            <tbody>
              {bt.tendencies.rows.map((x) => (
                <tr key={x.metric}>
                  <td>{x.label}</td>
                  <td className={`num${x.model <= Math.min(x.teamAverage, x.leagueAverage) ? " best-cell" : ""}`}>{x.model.toFixed(2)}</td>
                  <td className="num">{x.teamAverage.toFixed(2)}</td><td className="num">{x.leagueAverage.toFixed(2)}</td>
                  <td className="num">{Math.round((1 - x.model / x.teamAverage) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="secondary">
          The gains are modest. A single match swings a lot around any forecast: read these as the centre of a wide range.
        </p>
      </section>

      <section className="card stack" id="absences">
        <h2>Unavailable players and their impact</h2>
        <p>
          The injury and suspension lists come from the data provider and show who is unavailable now. To say how much an
          absence matters, every player in the current squad gets an <b>impact score</b> from 0 to 100: half is the share of the
          team’s possible minutes he has played this season, half is his attacking share, the average of his share of the team’s
          non-penalty xG and of its goals plus assists, scaled so the team’s biggest attacking contributor counts as full marks.
          Minutes carry goalkeepers and defenders, who have little attacking output; the attacking half lifts the players who
          create and finish the chances. Players are <b>ranked</b> on the score within the current squad.
        </p>
        <p>
          <b>Core impact</b> is the combined score of the team’s eleven highest-impact players. A team’s absence figure is the
          combined score of everyone unavailable divided by its core impact: below 10% is minor, 10–25% noticeable,
          25% or more heavy. A player with no minutes this season has an impact of zero.
        </p>
        <p className="secondary">
          This is a transparent rule of thumb, not a tested model: it has not been backtested against results, and it ignores
          who the replacement is, how good the opponent’s own absences are and the position’s importance. Early in the season
          the shares rest on few matches; the squad rank is only as good as the minutes behind it.
        </p>
      </section>

      <section className="card stack">
        <h2>Trends</h2>
        <p>
          A trend is flagged when a team’s last three matches differ from its earlier matches by more than its own normal
          match-to-match variation would explain, and by at least 12% of the league average. Player usage is flagged when a
          player’s share of minutes moves by 25 points or more.
        </p>
      </section>
    </main>
  );
}

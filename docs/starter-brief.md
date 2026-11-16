# Starter brief: a "follow my team" app for Allsvenskan

Use this to start a new session. It condenses what was built for the NFL version ("Gameplan",
repo `olofnordberg-dev/nfl-following`, live at nfl-following.vercel.app), why, and what was
learned, then says what changes for Swedish football.

## Intent

A personal app for following one favourite team (switchable, remembered in the browser) that
answers, before every match:

1. **Who do we play next, and how do we compare?** A simple overview first, then deep dives.
2. **What are the opponent's strengths and weaknesses against ours?** Unit against unit.
3. **What should we expect?** Likely style, set-ups and which players will feature.
4. **What is changing?** Recent trends in tactics and player usage, not just season averages.

Principles that carried through the whole build:

- **Free data only**, verified before building on it (a "phase 0" that downloads every source
  and records what really exists, how fresh it is and which fields are filled).
- **Overview first, depth on demand**: ranks and percentile bars up top, full tables and splits
  one click away, every number shown beside the league average.
- **Honest forecasts**: every prediction is backtested (tune on last season, score untouched on
  the current one, always against simple baselines) and the results are published in the app.
- **Say what the data can't do**: data that only arrives after the season is labelled as last
  season's; small samples are flagged rather than hidden.

## What was built (NFL), in phases

| Phase | Result |
|---|---|
| 0 Verify sources | Audit of every free source: freshness, lag, which fields exist in season |
| 1 Pipeline | Python + DuckDB: download → one row per play with all sources joined → team/unit aggregates per game, season and last-4, with rank, percentile and league average; player usage per week. Metrics defined once in a list, generated into every grouping. Tests on invariants |
| 2 Overview + match-up | Next.js static site: team page (next game, ranks, schedule), match-up page (biggest edges and risks, unit-vs-unit percentile bars, tendencies, injuries) |
| 3 Deep dives | Per side of the ball: every metric with rank and last-4, plus situational splits beside the league |
| 4 Trends | Flag metrics whose last 3 games differ from the rest of the season, scaled by the team's own game-to-game noise plus a practical minimum; same for player shares |
| 5 Forecasts | Situational probabilities with fitted team offsets; tendency rates (recency-weighted, shrunk to league); player shares (recency-weighted, injury-adjusted). Methods page with backtests |
| 6 Ops | GitHub Actions nightly: download, build, test, build site, commit data → Vercel redeploys |
| 7 UX | "Keys to the game" (3–5 pieces of advice per coach, generated from the data), game-log bar chart with stat pills and L3/L5/Season + Home/Away filters, opponent logos under bars, dashed average line; field maps; insight cards in a right rail; dark navy theme with toggle |

## Architecture that worked

- **Pipeline**: Python, DuckDB, parquet. `download` (finished seasons cached) → `build`
  (rebuild from scratch, swap in only on success) → `export` (small JSON per team) → tests.
- **Web**: Next.js, statically generated from the JSON, so no database or server is needed.
  All data access in one file so a database can be added later.
- **Refresh**: one scheduled GitHub Actions job commits new data; the host deploys on push.
- **Forecast code** keeps tuning season and evaluation season separate and stores the
  backtest summary next to the forecasts.

## Lessons worth carrying over

- Verify sources first; some "available" data turned out to be published only after a season.
- Define each metric once (name, label, direction "higher is better", format) and generate
  tables, ranks and charts from that list. Flip the direction for the defending side.
- Ranks need a direction; tendencies (neither good nor bad) need "1st = highest" instead.
- Recent games predicted player usage better than season averages; the previous game alone
  beat the season average.
- Show how much a forecast helps against simple baselines, even when the gain is small.
- Keep forecasts to the next game only, because availability (injuries, suspensions) changes weekly.

## Translating to Allsvenskan

| NFL concept | Football equivalent |
|---|---|
| EPA per play | xG / xGA per match, non-penalty xG, xG per shot; points and goals as the simple layer |
| Offense / defense / special teams | Attack / defence / set pieces (corners, free kicks, penalties) |
| Run vs pass, tempo, motion | Possession share, directness, build-up style, pressing intensity, crosses, long balls |
| Formations and personnel | Starting formation and line-up per match |
| Snap / target / carry share | Minutes share, starts, share of team shots, xG and xA |
| Injury report | Injuries plus suspensions (yellow-card accumulation) |
| Down and distance splits | Game state (leading / level / trailing), home / away, first / second half, minute bands |
| Pass areas and run gaps | Shot maps, attacking thirds and channels (left / centre / right) |
| 17 games, weekly | 30 rounds (16 teams), roughly April to November; check the current format |

Forecasts translate naturally: match outcome probabilities from team attack/defence strengths
(e.g. a Poisson or Dixon–Coles model) with home advantage; expected line-ups and minutes from
recent usage plus availability; tendencies (possession, pressing, set-piece threat) shrunk to
the league. Backtest the same way: tune on last season, score on this one, against baselines
such as league table position and bookmaker odds if a free odds source exists.

## Phase 0 for the new session

Do not assume coverage; verify each candidate source for Allsvenskan before designing around
it. Candidates to check (none verified in this session): the league's official site and match
centre, FBref, football-data.co.uk (results and odds), FotMob and SofaScore (unofficial, check
terms of use), Transfermarkt (squads, injuries), Wikipedia (fixtures). For each, record whether
it has xG, shot locations, line-ups, minutes, cards and injuries, how soon after a match it
updates, and whether automated access is allowed. Without event-level data, build the first
version on results, line-ups and minutes, and add xG when a reliable source is found.

## Prompt to start with

> I want to build a web app to follow my favourite Allsvenskan team (changeable): upcoming
> matches, opponent strengths and weaknesses compared with my team, what to expect (style,
> line-ups, players likely to feature) and trends in tactics and player usage. Simple overview
> first, deep dives on attack, defence and set pieces. Free data only. Start with phase 0:
> investigate and verify which free sources cover Allsvenskan and what they contain, then
> propose a plan. The attached brief describes a similar app I built for the NFL.

# Phase 0 findings: what free data exists for Allsvenskan

Audited 16 November 2026 with `scripts/phase0_audit.py`; the full output is in
`phase0-audit-output.txt`. Only one source was audited: the Bzzoiro Sports Data
(BSD) API, with a free account. It turned out to cover everything the app needs,
so the other candidates in the brief (FBref, football-data.co.uk, FotMob,
SofaScore, Transfermarkt, Wikipedia, the league site) were **not checked**.

## Verdict

One free API is enough to build the whole app: results, team statistics, shot
locations with xG, line-ups, minutes, cards, injuries and suspensions, odds and
predicted line-ups, refreshed within hours of a match. The main caveats are that
this season's xG is estimated, that 2025 is patchy, and that it is an unofficial
compilation run by a small company.

## What exists

| Data | 2026 (current) | 2025 | Earlier |
|---|---|---|---|
| Results, rounds, kick-off times | 224 of 240 played, complete | complete | complete back to 2008 |
| Team statistics per match | all matches, about 50 fields (possession, passes, shots, box touches, final-third entries, duels, set-piece counts) | rounds 1–6 none; after that often only 10 basic fields | basic stats from 2013 |
| Shot map (position, body part, situation, outcome, xG per shot) | all matches | all matches | from late 2022 |
| Line-ups and formations | all matches, confirmed | all matches, but player ids missing in rounds 18–30 | from 2012 |
| Player statistics per match (minutes and about 70 fields) | all matches | all matches | from 2012 |
| Goals, cards, substitutions with minutes | all matches | all matches | from 2012 |
| Injured and suspended players, with reason | current squad list, and per match for 157 of 224 matches | not kept | no |
| Bookmaker odds (1X2, totals, both teams to score) | 80% of played matches, and upcoming | none | none |
| Predicted line-up and the provider's own match forecast | upcoming matches | no | no |
| Standings, squads, coaches, referees, venues, team logos | yes | – | – |
| Attendance | never filled | – | – |

## Things that are not what they seem

- **xG this season is estimated.** Every 2026 shot carries `xg_estimated: true`:
  the provider computes it from shot position and type. A separate provider xG
  total (`expected_goals`) exists for 76% of matches and can differ a lot from
  the shot sum in a single match (2.49 against 3.32 in one case). The app uses
  the shot-based figure everywhere, because it exists for every match and splits
  by situation, and says so on the Methods page.
- **The "stats available" flag hides depth.** `availability` reports stats for
  100% of 2025 matches, but rounds 1–6 have no team statistics at all and many
  later ones have 10 fields instead of 50. Missing is stored as missing, never
  as zero.
- **Counts are omitted when zero** (offsides, big chances, red cards), so a
  missing key inside an otherwise full stats block means 0.
- **Duplicate fixtures.** A rescheduled match can stay in the list as an orphan
  with status `unresolved` (Elfsborg–Häcken, round 9). The build keeps one copy
  per home/away pairing and a test enforces it.
- **Line-up player ids are missing for part of 2025.** Starters are therefore
  derived from the player statistics and substitutions (played, and did not
  come on), which works for every match.
- **Pitch side is undocumented.** Shot coordinates do not say which side is left
  or right, so the app draws shot maps but makes no left/right claims.

## Freshness and limits

- The last round (8 November) was complete in every resource. The provider
  settles results the same evening; line-up records are still being touched a
  week later, so the pipeline re-downloads matches from the last four days.
- Free football access allows 7,500 requests a day. The first full download
  (two seasons of detail) took about 2,400 requests; a nightly refresh takes
  under 100.
- Licence (version 4.0, 1 October 2026): storing the data, analysing it and
  showing it in your own app is allowed; redistributing the raw data as a
  dataset is not. Raw downloads therefore stay out of the repository; only the
  derived per-team JSON is committed. Logos are hot-linked from the provider's
  image endpoint, for identification only.

## Consequences for the design

- Team metrics, splits and shot maps use 2026 only. 2025 is used where it is
  good enough: results, shots and line-ups, for tuning the forecasts.
- Forecasts are tuned on 2025 and scored on 2026. Bookmaker odds exist only for
  2026, so they serve as a reference in the backtest, not as a model input.
- Results from 2021 on feed the team-strength model; nothing before 2021 is
  downloaded.

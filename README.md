# Matchplan: follow an Allsvenskan team

A personal site for following one Allsvenskan team (Djurgården by default; switchable and
remembered in the browser). Before every match it answers:

1. **Who do we play next, and how do we compare?** Win/draw/loss chances, ranks and the table.
2. **Where are the mismatches?** Attack against defence, both ways, plus set pieces.
3. **What should we expect?** Possession, shots, xG, corners and the likely line-ups.
4. **What is changing?** The last three matches against the rest of the season.

It is the football counterpart of the NFL app described in `docs/starter-brief.md`.

## How it works

```
Bzzoiro Sports Data API ──download──▶ data/raw (cached JSON, not committed)
                         ──build────▶ data/allsvenskan.duckdb
                         ──export───▶ web/data/*.json (committed) ──▶ Next.js static site
```

- `pipeline/download.py` fetches results from 2021 and full match detail for the current and
  previous season. Finished matches are cached; the last four days are refreshed.
- `pipeline/build.py` builds DuckDB tables: one row per team per match (own numbers and the
  opponent's), shots, player minutes, and every metric with league rank, percentile and average.
- `pipeline/metrics.py` defines each metric once (label, unit, direction, format). Tables,
  ranks, trends and the site are generated from that list.
- `pipeline/predict.py` makes the forecasts and backtests them: tuned on last season, scored on
  this one, always beside simple baselines. Results are shown on the site's Methods page.
- `pipeline/trends.py` flags recent changes that exceed a team's normal match-to-match noise.
- `pipeline/export.py` writes one small JSON file per team and per upcoming match.
- `web/` is a statically generated Next.js site. All data access is in `web/lib/data.ts`.
- `.github/workflows/refresh-data.yml` runs the pipeline nightly and commits `web/data`.

## Run it

```bash
pip install -r requirements.txt
```

```bash
BSD_TOKEN=your-token python -m pipeline run
```

```bash
python -m pytest -q
```

```bash
cd web && npm ci && npm run dev
```

`python -m pipeline download|build|export` runs one step. The first download makes about 2,400
requests (the free limit is 7,500 a day); later runs make under 100.

## Set-up outside this repository

- **Nightly refresh:** add the API token as a repository secret named `BSD_TOKEN`
  (Settings → Secrets and variables → Actions). Without it the workflow fails at the download.
- **Hosting:** import the repository in Vercel with `web` as the root directory. Every push to
  `main`, including the nightly data commit, then deploys.

## Things to know about the data

See `docs/phase0-findings.md`. In short: one free, unofficial source; this season's xG is
estimated from shot positions; 2025 detail is patchy, so team pages cover the current season
only; injuries and suspensions are the provider's list and can lag.

## Between seasons

When the season ends there is no next match, and the site says so. When the provider opens the
new season, the pipeline follows its "current season" flag: the finished season becomes the
tuning season. Early in a season, ranks and trends rest on very few matches.

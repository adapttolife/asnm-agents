# ASNM organization scraper

`org-scraper` discovers possible organizations for a sport and U.S. area. New organization rows remain unverified and private. `org-filler` fills organization details, and `program-scraper` discovers programs and links them to known organizations.

## Setup

Run `db/migrations/0025_organization_discovery_pairs.sql` against staging and production, then install and seed the geographic catalog on the Pi:

```sh
cd ~/asnm-agents/org-scraper
npm install
cp .env.example .env
cp prod.env.example prod.env
npm run seed:areas
```

The area seed uses the U.S. Census Bureau ACS 2024 API and writes `data/us-areas.json`, containing U.S. states, counties, and Census places. Re-run it when the catalog needs refreshing.

Set Cloudflare API credentials in the chosen environment file. `OPEN_WEBSEARCH_ENGINES` accepts a comma-separated list, such as `duckduckgo,bing`.

## Run

```sh
npm run dry-run
npm run staging
npm run prod
node index.js --once
```

Normal staging and production runs continuously. Each cycle searches a due, locked sport-area pair for new organizations. Area pairs use the existing county/city/state refresh periods of 91/183/30 days. Failed runs release their locks without advancing their refresh timestamps.

## Statistics

Each process creates one JSON file in `statistics/`. It records area pairs completed/skipped, organizations queued, failures, processed pairs, and the current search target.

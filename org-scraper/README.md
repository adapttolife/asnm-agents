# ASNM organization scraper

`org-scraper` discovers possible organizations for a sport and U.S. area. It saves only a candidate name and public website URL, with `verification_status = 'unverified'`, `status = 'filling'`, `is_public = 0`, and both consent fields set to `0`. `org-filler` later researches the candidate before it can become public.

## Setup

Run the D1 migration `db/migrations/0025_organization_discovery_pairs.sql` against staging and production, then install and seed the geographic catalog on the Pi:

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

Normal staging and production runs continuously: they choose a due, unlocked sport-area pair, atomically lock it in D1, query matching existing organizations, search multiple engines, add only candidates not already in that area, then release and timestamp the pair. County pairs wait 91 days, city pairs 183 days, and state pairs 30 days before they are eligible again. A failed run unlocks the pair without advancing its refresh timestamp.

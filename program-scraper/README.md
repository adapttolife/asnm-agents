# ASNM program scraper

`program-scraper` discovers adaptive-sports programs in two ways: by sport and U.S. area, and by searching existing organizations for programs they offer. Area discoveries link to the existing “Organization not yet assigned” placeholder; organization discoveries link to the matching organization. New rows are unverified, private, and marked `filling`; `program-filler` researches their missing details later.

## Setup

Apply `db/migrations/0026_program_discovery_locks.sql` to both `asnm-db-staging` and `asnm-db` before running the scraper. The placeholder organization `a461f29b-0b89-4e17-b879-6a80e0abd101` already exists in both databases.

Install dependencies and seed the area catalog:

```sh
cd ~/asnm-agents/program-scraper
npm install
cp .env.example .env
cp prod.env.example prod.env
npm run seed:areas
```

Configure Cloudflare credentials and `OPEN_WEBSEARCH_ENGINES` in each environment file.

## Run

```sh
npm run dry-run
npm run staging
npm run prod
node index.js --once
```

Each cycle searches a due, locked sport-area pair and a due organization. County pairs wait 91 days, city pairs 183 days, and state pairs 30 days before another search. Organization-linked searches run every 183 days per organization by default and can be changed with `ORGANIZATION_PROGRAM_REFRESH_DAYS`. Both workflows check existing programs before inserting. Area discoveries use the placeholder organization; organization discoveries use `listing = 'with_org'` and copy the organization's city and state. All candidates remain private and unverified. Failed runs release their locks without advancing the refresh time.

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`. Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`.

## Statistics

Each process writes a JSON statistics file under `statistics/`, tracking completed and skipped area pairs, organization-linked discovery runs, queued program candidates, and failures.

# ASNM event scraper

`event-scraper` discovers events in two ways: by sport and U.S. area, and by searching organizations and programs already in the database. Organization searches link candidates with `org_id`; program searches link with `program_id` and the program's organization when it has a real organization. Candidates are inserted with `is_public = 0`, `status = 'scheduled'`, and `source = 'event_scraper'` for review. Events without an explicitly supported start date are skipped because `starts_at` is required by D1.

## Setup

Apply `db/migrations/0027_event_discovery_locks.sql` to both `asnm-db-staging` and `asnm-db` before running the scraper. Install dependencies and seed the area catalog:

```sh
cd ~/asnm-agents/event-scraper
npm install
cp .env.example .env
cp prod.env.example prod.env
npm run seed:areas
```

Configure Cloudflare credentials and `OPEN_WEBSEARCH_ENGINES` in each environment file. `EVENT_ENTITY_REFRESH_DAYS` sets the default 90-day refresh interval for each organization or program.

## Run

```sh
npm run dry-run
npm run staging
npm run prod
node index.js --once
```

Area searches use persistent sport-area locks with county, city, and state refresh periods of 91, 183, and 30 days. Entity searches use separate organization/program locks. Both workflows check existing event URLs and matching title/date/location/sport before inserting. A failed search releases its lock without advancing the refresh timestamp.

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`. Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`.

## Statistics

Each process writes a JSON statistics file under `statistics/`, tracking area searches, organization/program searches, candidate and queued event counts, and failures.

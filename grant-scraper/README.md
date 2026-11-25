# ASNM grant scraper

`grant-scraper` discovers standalone adaptive-sports grant opportunities by searching sports and U.S. areas. It does not associate grants with organizations or programs. Discovery inserts only the grant name and source URL, keeps the row private with `is_public = 0`, `is_open = 0`, and `status = 'pending'`, and leaves other details for review and `grant-filler`. The current schema defaults a missing audience to `athlete`; admins should verify that value before publishing.

## Setup

Apply `db/migrations/0028_grant_discovery.sql` to both `asnm-db-staging` and `asnm-db` before using apply mode. This creates dedicated sport-area locks and indexes used for duplicate checks. Install dependencies and seed the area catalog:

```sh
cd ~/asnm-agents/grant-scraper
npm install
cp .env.example .env
cp prod.env.example prod.env
npm run seed:areas
```

Configure Wrangler access and `OPEN_WEBSEARCH_ENGINES` in the environment files. Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`. Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`.

## Run

```sh
npm test
npm run dry-run
npm run staging
npm run prod
node index.js --once
node index.js --prod --once --apply
```

Dry-run is the default. `--apply` enables inserts. Apply mode repeats every hour by default; `--once` runs a single sport-area search. Area locks use county, city, and state refresh periods of 91, 183, and 30 days. D1 checks for a matching normalized name or source URL before each insert. A failed search releases its lock without advancing the refresh timestamp.

Each process writes logs and a JSON statistics file under `logs/` and `statistics/`.

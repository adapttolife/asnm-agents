# ASNM program filler

`program-filler` fills empty details on every existing program row. It does not create programs or organizations, replace populated values, change the organization link, or change verification and visibility settings. Event rows in the shared `programs` table are excluded.

## Flow

1. Read eligible program rows with at least one supported field empty, including the linked organization name and website for context.
2. Crawl the program website, or the linked organization's website when the program has no URL. If HTTP crawling fails, try Chromium. If no usable site is available, search for the linked program and crawl public results.
3. Ask Gemini for only the requested empty program fields, with a source URL for each value. Unknown details stay empty.
4. Normalize supported values and geocode only a source-backed street address.
5. In apply mode, update only fields that remain empty at write time.

## Targets and commands

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`:

```sh
npm test
npm run dry-run
node index.js --limit 25
node index.js --id <program-id>
node index.js --limit 25 --apply
```

Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`:

```sh
npm run prod
```

`npm run prod` writes approved values and repeats after each pass. Apply-mode runs without `--id` wait one hour by default; set `RUN_INTERVAL_MS` to change the interval. Dry runs and runs with `--id` are one-shot. The process verifies the selected D1 target before querying it.

## Fields

The filler can populate `slug`, `sport`, `sport_key`, `sports_json`, website, email, phone, city, state, ZIP, country, address, coordinates, geolocation precision, description, cost note, equipment provided, ages, seasons, usual month, and first year. It never changes `organization_id`, `kind`, `listing`, contact or address consent, verification status, listing visibility, or status.

## Setup and logs

Install Node.js 20+ and Chromium, then run `npm install` and copy `.env.example` to `.env` and `prod.env.example` to `prod.env`. Configure Gemini and Cloudflare D1 credentials in the matching environment files. `OPEN_WEBSEARCH_ENGINES` accepts a comma-separated list such as `duckduckgo,bing`.

Each run writes timestamped logs and a statistics JSON file under `logs/` and `statistics/`.

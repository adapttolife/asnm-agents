# ASNM event filler

`event-filler` fills empty details on existing rows in the `events` table. It uses the live event schema: `id`, `title`, `description`, `org_id`, `sport_key`, `venue`, `city`, `state`, `url`, `starts_at`, `ends_at`, `all_day`, `status`, `is_public`, `source`, `created_at`, `updated_at`, `program_id`, and `recap_url`.

It only fills `description`, `sport_key`, `venue`, `city`, `state`, `url`, `starts_at`, `ends_at`, and `recap_url`. It never changes `org_id`, `program_id`, `all_day`, `status`, `is_public`, or `source`. Values are accepted only when backed by a crawled source page, and writes only affect fields that remain empty at update time.

## Flow

1. Read events with one or more supported fields empty, including linked organization and program names and their websites for context.
2. Crawl the event URL, linked program website, or linked organization website. If no usable page is available, search for the event and crawl public results.
3. Ask Gemini for only the empty event fields and require a cited source URL for each returned value. Timestamp values need an explicit timezone unless the source gives an all-day date.
4. Validate sports, state codes, URLs, and timestamps before proposing or applying a patch.

## Targets and commands

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`:

```sh
npm test
npm run dry-run
node index.js --limit 25
node index.js --id <event-id>
node index.js --limit 25 --apply
```

Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`:

```sh
npm run prod
```

Apply-mode runs without `--id` repeat every hour by default; set `RUN_INTERVAL_MS` to change the interval. Dry runs and runs with `--id` are one-shot. The process verifies the selected D1 target before querying it.

Install Node.js 20+ and Chromium, then run `npm install` and copy `.env.example` to `.env` and `prod.env.example` to `prod.env`. Configure Gemini and Cloudflare D1 credentials in the matching environment files. Each process writes timestamped logs and statistics under `logs/` and `statistics/`.

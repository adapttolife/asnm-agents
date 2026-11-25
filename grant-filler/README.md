# ASNM grant filler

`grant-filler` researches existing rows in the `grants` table and fills only supported fields that are empty. It does not create grants or link them to organizations or programs.

The fillable fields are `source`, `type`, `audience`, `amount_min_cents`, `amount_max_cents`, `amount_display`, `deadline_display`, `deadline_next`, `description`, `eligibility_criteria`, `how_to_apply`, `application_url`, `source_url`, `email`, `phone`, and `sports_json`. It never changes the grant name or ID, open/renewable flags, visibility, status, or timestamps. Each proposed field must cite an exact crawled source URL. Writes are guarded so a value filled by another process is preserved.

## Setup

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`. Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`. Install dependencies, copy the matching environment examples, and configure Gemini and Wrangler credentials.

## Run

```sh
npm test
npm run dry-run
node index.js --limit 25
node index.js --id <grant-id>
node index.js --limit 25 --apply
```

Dry-run is the default. `--apply` writes only validated fields that remain empty. A normal apply run repeats every hour by default; set `RUN_INTERVAL_MS` to change the interval. Use `--id` for a one-shot row.

Each process writes timestamped logs and statistics under `logs/` and `statistics/`.

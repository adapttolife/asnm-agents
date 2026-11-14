# ASNM organization filler

`org-filler` fills missing information for existing, administrator-verified organizations. It never creates organizations, changes filled values, or processes unverified or inactive rows.

## Flow

1. Query verified, active organizations with one or more empty supported fields.
2. For an existing `website_url`, politely crawl up to 20 same-site HTML pages. Cheerio removes non-content markup and Turndown converts page content to Markdown.
3. If HTTP crawling the known URL fails, open the URL in Chromium through Playwright.
4. If no usable site is available, use the local `open-websearch` daemon to find a new public URL, waiting at least five seconds between searches. Crawl its first usable result.
5. Send only the empty field names, organization context, permitted sport keys, and collected Markdown to Gemini. Multiple Gemini keys rotate and are rate-limited independently.
6. Validate the structured JSON response, geocode a confirmed U.S. street address when appropriate, and write only fields that are still empty. `--apply` is required to write.

## Raspberry Pi setup

Install Node.js 20+ and Chromium, then install project dependencies:

```sh
cd ~/asnm-agents/org-filler
npm install
cp .env.example .env
cp prod.env.example prod.env
```

Set `GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` in both environment files. Add further comma-separated Gemini keys in `GEMINI_API_KEYS`. The Cloudflare token replaces `wrangler login`, so runs continue after an interactive login expires. It needs the Account-level `D1:Edit` permission for the ASNM account. If Chromium is not located at `/usr/bin/chromium`, `/usr/bin/chromium-browser`, or `/usr/bin/google-chrome`, set `BROWSER_EXECUTABLE_PATH`.

`open-websearch` is installed with this project and starts as a temporary local HTTP service. Set `OPEN_WEBSEARCH_URL` only when it is already managed as a separate daemon.

## Targets and commands

Staging uses `.env`, `wrangler.jsonc`, and `asnm-db-staging`:

```sh
npm test
npm run dry-run
node index.js --limit 25
node index.js --id <organization-id>
node index.js --limit 25 --apply
```

Production uses `prod.env`, `wrangler.prod.jsonc`, and `asnm-db`:

```sh
npm run prod
```

`npm run prod` includes `--apply`, so it writes approved values to production. Every run fails before accessing D1 if its selected environment file or Wrangler configuration file is missing, or if the environment file names the wrong database.

## Fields

The tool can fill only: `sport_key`, `website_url`, `email`, `phone`, `city`, `state`, `state_name`, `zip`, `address`, `lat`, `lng`, `geo_precision`, and `description`.

To preserve consent and approval decisions, it never updates verification, visibility, contact-publicity, or claim fields.

## Logs

Every run writes the same timestamped messages to the console and `logs/org-filler-YYYY-MM-DD.log`. The log records the number of rows still needing filling, whether each crawler attempt succeeded, whether Chromium or open-websearch was used, Gemini and Census-geocoder use, each organization's elapsed time, and the total runtime.

## Statistics

Each process creates its own JSON file in `statistics/`. It is updated after every changed, skipped, or failed row and records the run mode, environment, changed and skipped counts, failure count, and the names of organizations with a proposed or applied change.

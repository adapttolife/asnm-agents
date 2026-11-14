# ASNM organization filler

`org-filler` runs on the Raspberry Pi and fills missing information for existing, administrator-verified organizations in `asnm-db-staging`. It does not create organizations, change filled values, or process unverified or inactive rows.

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
npx wrangler login
```

Set at least `GEMINI_API_KEY` in `.env`. Add further comma-separated keys in `GEMINI_API_KEYS`. If Chromium is not located at `/usr/bin/chromium`, `/usr/bin/chromium-browser`, or `/usr/bin/google-chrome`, set `BROWSER_EXECUTABLE_PATH`.

`open-websearch` is installed with this project and starts as a temporary local HTTP service. Set `OPEN_WEBSEARCH_URL` only when it is already managed as a separate daemon.

## Run

```sh
npm test
npm run dry-run
node index.js --limit 25
node index.js --id <organization-id>
node index.js --limit 25 --apply
```

Dry-run prints proposed patches without changing D1. Review that output before using `--apply`.

## Fields

The tool can fill only: `sport_key`, `website_url`, `email`, `phone`, `city`, `state`, `state_name`, `zip`, `address`, `lat`, `lng`, `geo_precision`, and `description`.

The D1 guard is fixed to `asnm-db-staging`. To preserve consent and approval decisions, it never updates verification, visibility, contact-publicity, or claim fields.
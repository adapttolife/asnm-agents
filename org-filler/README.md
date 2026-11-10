# ASNM organization filler

`org-filler` enriches existing rows in `asnm-db-staging` only. It never creates rows or overwrites non-empty values. It identifies incomplete organization records, uses Searlo search results as evidence for Gemini, validates the response, geocodes only a confirmed street address through the Census geocoder, and writes only fields that remain empty.

## Setup

```sh
cd org-filler
npm install
copy .env.example .env
```

Set `GEMINI_API_KEY` and `SEARLO_API_KEY` in `.env`. To use multiple Google Cloud projects, set one Gemini key as `GEMINI_API_KEY` and the other five as comma-separated values in `GEMINI_API_KEYS`. Set the second Searlo key in `SEARLO_API_KEYS`.

## Web lookup

The tool groups organizations into batches of up to ten and sends each batch to Searlo's web-search endpoint. It rotates configured Searlo keys between batches. Gemini receives the first five results' titles, URLs, and snippets for each organization, and accepts a field only when the associated evidence URL is one of those search results.

## Run

Dry-run is the default and prints proposed patches only:

```sh
npm run dry-run
node index.js --limit 25
node index.js --id <organization-id>
```

Apply reviewed results:

```sh
node index.js --limit 25 --apply
```

The default model is `gemini-3.5-flash-lite`. Gemini requests are paced at 15 requests per minute, capped at 250,000 estimated input tokens per rolling minute, and stop at 500 requests per Pacific-calendar day for each configured Google Cloud project. Six projects provide combined capacity of 90 requests per minute, 1.5 million input tokens per minute, and 3,000 requests per day.

The tool is hard-coded to `asnm-db-staging`. It fills only `sport_key`, website, public email and phone, city, state, state name, ZIP, address, latitude, longitude, geo precision, and description. Unknown or unsupported values stay empty.

## Safeguards

Review a dry run before using `--apply`. The tool never creates organizations, never replaces a populated field, and its database module rejects any target other than `asnm-db-staging`. `wrangler` must already be authenticated for the Cloudflare account that owns that database. Gemini is used only for fields that cannot be derived from the existing `sport` or `state` value.
# ASNM ORganizations Scraper

This project `org-scraper` will be a Node.js script that uses Gemini to search the web for organizations related to a specific adaptive sport, filter out those already present in the Cloudflare D1 database, and return the results in a structured format.

## Start

Access to Cloudflare Workers is required to run this project. You'll need a free Cloudflare account and an invite to the organization to access the database. Once you have access, you can run the commands below.

- Install packages: `npm i`
- Run tests: `npm run test`
- Start scraper: `npm run start`
- Start controller: `npm run controller`
- Generate `schema.json`: `npm run schema`

## Features

- Node.js script
- Hosted on Cloudflare Workers
- Runs every minute
- Tests with Jest
- Uses Gemini API
- Searches the web
- Uses multiple keys
- Keys lock when limit is hit
- Keys unlock automatically after cooldown
- Cloudflare D1 database integration to
  - Check for existing organizations
  - Push new organizations to the database
  - Get a sample organization row from the database for reference
  - Get sports
  - Manage locks for sports and states
- Runs on Windows locally for testing, Linux for production

## Plan

1. Manually get the database schema.
   1. Fetches the latest sports and organizations table schema.
   2. Transform the schema into a JSON schema format.
   3. Output the JSON schema to `schema.json`.
   4. Prune the generated schema to only include the properties that Gemini should fill.
2. Controller runs every minute.
   1. Fetches latest `schema.json`.
   2. Repeat 2x.
      1. Finds a sport-state pair that is not locked and has not been scraped recently.
      2. Creates a lock for the sport-state pair.
      3. Initiates the scrape.
      4. Unlocks the sport-state pair after scraping is complete.
3. Scraper runs when initiated.
   1. Fetches the organizations in the table matching the sport-state pair.
   2. Search for organizations in the state related to the sport that are not already scraped using Gemini.
   3. Push the new organizations to the database.

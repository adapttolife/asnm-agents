# Plan

This project `org-scraper` will be a Node.js script that uses Gemini to search the web for organizations related to a specific adaptive sport, filter out those already present in the Cloudflare D1 database, and return the results in a structured format.

- Node.js script
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
- Runs on Windows locally for testing, Linux for production

import { unstable_dev } from 'wrangler';
import * as fs from 'fs';

// Initialize Worker locally
let worker = await unstable_dev('database.js', {
    config: 'database-test.jsonc',
    experimental: { disableExperimentalWarning: true },
});

const resp = await worker.fetch('/schema?table=organizations'); // Fetch the schema for the organizations table
const schema = await resp.json(); // Parse the response as JSON
await fs.promises.writeFile('schema.json', JSON.stringify(schema, null, 4)); // Write the schema to schema.json
await worker.stop(); // Stop the Worker

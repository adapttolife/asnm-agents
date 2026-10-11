// import assert from 'node:assert/strict';
// import * as database from './database.js';

// test('Get organizations table schema from D1 database', async () => {
//     const tableName = 'organizations';
//     const schema = await database.tableSchema(tableName);
//     console.log('Organizations table schema:', JSON.stringify(schema, null, 2));
//     assert.ok(schema);
//     assert.equal(schema.title, tableName);
// }, 20000);

// test('Get sample row from organizations table', async () => {
//     const tableName = 'organizations';
//     const row = await database.sampleRow(tableName);
//     console.log('Sample row:', row);
//     assert.ok(row);
// }, 20000);

import { unstable_dev } from "wrangler";

describe("tableSchema via D1", () => {
    let worker;

    beforeAll(async () => {
        worker = await unstable_dev("database.js", {
            config: "database-test.jsonc",
            experimental: { disableExperimentalWarning: true },
        });
    });

    afterAll(async () => {
        await worker.stop();
    });

    it("should return schema for a table", async () => {
        const resp = await worker.fetch("/?table=organizations");
        expect(resp.status).toBe(200);
        const schema = await resp.json();
        expect(schema.type).toBe("array");
        expect(schema.items).toBeDefined();
    });

    it("should return an error for a nonexistent table", async () => {
        const resp = await worker.fetch("/?table=nonexistent");
        expect(resp.status).toBe(500);
    });

    it("should return an error for a missing table name", async () => {
        const resp = await worker.fetch("/");
        expect(resp.status).toBe(400);
        const error = await resp.json();
        expect(error.error).toBe("Table name is required");
    });
});

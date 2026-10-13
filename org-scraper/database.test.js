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
    }, 20000);

    it("should return an error for a nonexistent table", async () => {
        const resp = await worker.fetch("/?table=nonexistent");
        expect(resp.status).toBe(500);
    }, 20000);

    it("should return an error for a missing table name", async () => {
        const resp = await worker.fetch("/");
        expect(resp.status).toBe(400);
        const error = await resp.json();
        expect(error.error).toBe("Table name is required");
    }, 20000);

    it("should return a sample row for a table", async () => {
        const resp = await worker.fetch("/sample?table=organizations");
        expect(resp.status).toBe(200);
        const row = await resp.json();
        expect(row).toBeDefined();
    }, 20000);

    it("should return a list for matching state-sport organizations", async () => {
        const resp = await worker.fetch("/matchingOrganizations?state=NY&sport=basketball");
        expect(resp.status).toBe(200);
        const list = await resp.json();
        expect(list).toBeInstanceOf(Array);
        expect(list.length).toBeGreaterThanOrEqual(0);
    }, 20000);

    it("should return an empty list for no matching state-sport organizations", async () => {
        const resp = await worker.fetch("/matchingOrganizations?state=ZZ&sport=nonexistent");
        expect(resp.status).toBe(200);
        const list = await resp.json();
        expect(list).toBeInstanceOf(Array);
        expect(list.length).toBe(0);
    }, 20000);

    it("should add and remove a state-sport lock", async () => {
        const state = "NY";
        const sport = "basketball";
        const addResp = await worker.fetch(`/addStateSportLock?state=${state}&sport=${sport}`);
        expect(addResp.status).toBe(200);
        const addResult = await addResp.json();
        expect(addResult.success).toBe(true);
        const removeResp = await worker.fetch(`/removeStateSportLock?state=${state}&sport=${sport}`);
        expect(removeResp.status).toBe(200);
        const removeResult = await removeResp.json();
        expect(removeResult.success).toBe(true);
    }, 20000);

    it("should return a list of state-sport locks", async () => {
        const resp = await worker.fetch("/getStateSportLocks");
        expect(resp.status).toBe(200);
        const locks = await resp.json();
        expect(locks).toBeInstanceOf(Array);
        expect(locks.length).toBeGreaterThanOrEqual(0);
    }, 20000);
});

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
        const resp = await worker.fetch("/schema?table=organizations");
        expect(resp.status).toBe(200);
        const schema = await resp.json();
        expect(schema.type).toBe("array");
        expect(schema.items).toBeDefined();
    }, 20000);

    it("should return an error for a nonexistent table", async () => {
        const resp = await worker.fetch("/schema?table=nonexistent");
        expect(resp.status).toBe(500);
    }, 20000);

    it("should return an error for a missing table name", async () => {
        const resp = await worker.fetch("/schema");
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

    it("should initialize the state-sport table", async () => {
        const resp = await worker.fetch("/initStateSport");
        expect(resp.status).toBe(200);
        const result = await resp.json();
        expect(result.success).toBe(true);
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
        const resp = await worker.fetch("/stateSportLocks");
        expect(resp.status).toBe(200);
        const locks = await resp.json();
        expect(locks).toBeInstanceOf(Array);
        expect(locks.length).toBeGreaterThanOrEqual(0);
    }, 20000);

    it("should return a list of sports", async () => {
        const resp = await worker.fetch("/sports");
        expect(resp.status).toBe(200);
        const sports = await resp.json();
        expect(sports).toBeInstanceOf(Array);
        expect(sports.length).toBeGreaterThanOrEqual(0);
    }, 20000);

    it("should validate JSON against the schema", async () => {
        const validJson = {
            name: 'ROyal Wheelers Basketball Team',
            org_type: 'team',
            sport: 'Wheelchair Basketball',
            sport_key: 'basketball',
            sports_json: ['basketball'],
            website_url: 'https://www.example.com/royalwheelers',
            email: 'info@example.com',
            phone: '585-555-1234',
            city: 'Rochester',
            state: 'NY',
            state_name: 'New York',
            zip: '14604',
            country: 'USA',
            lat: 43.1566,
            lng: -77.6088,
            geo_precision: 'city',
            description: 'Adaptive basketball team in Rochester NY.',
            cost_note: null,
            equipment_provided: 1,
            ages: 'All ages',
            data_quality_rating: 'high',
            primary_data_source: 'web',
            verification_status: 'verified',
            verification_method: 'manual',
            status: 'active',
            is_public: 1
        };
        const resp = await worker.fetch("/validateOrganizationJson", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validJson),
        });
        expect(resp.status).toBe(200);
        const result = await resp.json();
        expect(result.success).toBe(true);
    }, 20000);

    it("should fail validation for invalid JSON", async () => {
        const invalidJson = {
            name: 'Invalid Organization',
            org_type: 123, // Invalid type
            sport: 'Basketball',
        };
        const resp = await worker.fetch("/validateOrganizationJson", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invalidJson),
        });
        expect(resp.status).toBe(400);
        const result = await resp.json();
        expect(result.error).toBeDefined();
    }, 20000);

    it("should successfully push a valid organization JSON to the database", async () => {
        const validJson = {
            name: 'ROyal Wheelers Basketball Team',
            org_type: 'team',
            sport: 'Wheelchair Basketball',
            sport_key: 'basketball',
            sports_json: ['basketball'],
            website_url: 'https://www.example.com/royalwheelers',
            email: 'info@example.com',
            phone: '585-555-1234',
            city: 'Rochester',
            state: 'NY',
            state_name: 'New York',
            zip: '14604',
            country: 'USA',
            lat: 43.1566,
            lng: -77.6088,
            geo_precision: 'city',
            description: 'Adaptive basketball team in Rochester NY.',
            cost_note: null,
            equipment_provided: 1,
            ages: 'All ages',
            data_quality_rating: 'high',
            primary_data_source: 'web',
            verification_status: 'verified',
            verification_method: 'manual',
            status: 'active',
            is_public: 1
        };
        const resp = await worker.fetch("/pushOrganization", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validJson),
        });
        expect(resp.status).toBe(200);
        const result = await resp.json();
        expect(result.success).toBe(true);
    }, 20000);
});
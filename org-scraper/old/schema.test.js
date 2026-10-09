import assert from 'node:assert/strict';
import { jsonSchemaFromDatabase } from './schema.js';
import Database from 'better-sqlite3';

test('JSON Schema from Database', () => {
    const db = new Database('../staging.db', { readonly: true });
    const schema = jsonSchemaFromDatabase(db, 'organizations');
    // console.log(JSON.stringify(schema, null, 2));
    assert.ok(schema);
    assert.ok(schema.properties);
    assert.ok(schema.required);
}, 60000);
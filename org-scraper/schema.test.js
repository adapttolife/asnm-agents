import assert from 'node:assert/strict';
import { toJsonSchema } from './schema.js';
import Database from 'better-sqlite3';

test('toJsonSchema', () => {
    const db = new Database('../staging.db', { readonly: true });
    const schema = toJsonSchema(db, 'organizations');
    // console.log(JSON.stringify(schema, null, 2));
    assert.ok(schema);
    assert.ok(schema.properties);
    assert.ok(schema.required);
}, 60000);
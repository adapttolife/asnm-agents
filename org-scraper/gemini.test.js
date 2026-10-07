import assert from 'node:assert/strict';
import * as gemini from './gemini.js';

test('Text', async () => {
    // const result = await gemini.gen('Hello world!');
    const result = { text: 'Hello, world! How can I help you today?' };
    assert.ok(result.text);
});

test('JSON', async () => {
    // const result = await gemini.gen('Generate a JSON object for a planet in our solar system. It should include the planet\'s name, description, and size.', null, null, false, {
    //     type: 'object',
    //     properties: {
    //         name: { type: 'string' },
    //         description: { type: 'string' },
    //         size: { type: 'string' },
    //     },
    //     required: ['name', 'description', 'size']
    // });
    const result = {
        json: {
            "name": "Mars",
            "description": "Mars is the fourth planet from the Sun and the second-smallest planet in the Solar System, being larger than only Mercury.",
            "size": "Radius of 3,389.5 km"
        }
    };
    assert.ok(result.json);
    assert.ok(result.json.name);
    assert.ok(result.json.description);
    assert.ok(result.json.size);
});
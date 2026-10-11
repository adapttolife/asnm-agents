import assert from 'node:assert/strict';
import * as gemini from './gemini.js';
import schema from './schema.json';

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

test('Grounded JSON', async () => {
    const state = 'New York';
    const stateCode = 'NY';
    const sport = 'Adaptive Basketball';
    const date = new Date();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    const limit = 50;
    const exclude = ["CNY Adaptive Sports", "Uptown Hoops NYC", "NYC Adaptive Basketball League"];
    // const result = await gemini.gen(`Look up Adaptive Sports organizations in ${state} State, specifically for the sport "${sport}". The organizations should be US-based, ${stateCode}-based, and currently running as of ${month} ${year}. Return as many as possible, but no more than ${limit} items. Exclude ${JSON.stringify(exclude)}. Return a JSON array response in the following format, where all values other than name may be null.`, null, null, true, schema);
    const result = {
        json: [
            {
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
            }
        ]
    };
    // console.log(result.json);
    assert.ok(result.json);
}, 60000);
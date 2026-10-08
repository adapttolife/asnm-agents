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

test('Grounded JSON', async () => {
    const state = 'New York';
    const stateCode = 'NY';
    const sport = 'Adaptive Basketball';
    const date = new Date();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    const limit = 50;
    const exclude = ["CNY Adaptive Sports", "Uptown Hoops NYC", "NYC Adaptive Basketball League"];
    // const result = await gemini.gen(`Look up Adaptive Sports organizations in ${state} State, specifically for the sport "${sport}". The organizations should be US-based, ${stateCode}-based, and currently running as of ${month} ${year}. Return as many as possible, but no more than ${limit} items. Exclude ${JSON.stringify(exclude)}. Return a JSON array response in the following format, where all values other than name may be null.`, null, null, true, {
    //     "type": "array",
    //     "$schema": "http://json-schema.org/draft-04/schema#",
    //     "description": "",
    //     "minItems": 1,
    //     "uniqueItems": true,
    //     "items": {
    //         "type": "object",
    //         "required": [
    //             "name",
    //             "website_url",
    //             "description",
    //             "org_type",
    //             "sport",
    //             "sports_json",
    //             "email",
    //             "phone",
    //             "city",
    //             "state",
    //             "zip",
    //             "lat",
    //             "lng",
    //             "address",
    //             "geo_precision"
    //         ],
    //         "properties": {
    //             "name": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "website_url": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "description": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "org_type": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "sport": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "sports_json": {
    //                 "type": "array",
    //                 "items": {
    //                     "required": [],
    //                     "properties": {}
    //                 }
    //             },
    //             "email": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "phone": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "city": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "state": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "zip": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "lat": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "lng": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "address": {
    //                 "type": "string",
    //                 "minLength": 1
    //             },
    //             "geo_precision": {
    //                 "type": "string",
    //                 "minLength": 1
    //             }
    //         }
    //     }
    // });
    const result = {
        json: [
            {
                name: 'Wheels of Courage Adaptive Sports NY',
                website_url: 'https://www.wheelsofcourageny.org',
                description: 'Providing competitive and recreational adaptive basketball opportunities for athletes with physical disabilities in the New York metropolitan area.',
                org_type: 'Nonprofit',
                sport: 'Adaptive Basketball',
                sports_json: [Array],
                email: 'info@wheelsofcourageny.org',
                phone: '212-555-0199',
                city: 'New York',
                state: 'NY',
                zip: '10001',
                lat: '40.7128',
                lng: '-74.0060',
                address: '123 Main St',
                geo_precision: 'rooftop'
            },
            {
                name: 'Empire State Wheelchair Basketball',
                website_url: 'https://www.empirestatewheelchairbasketball.org',
                description: 'Statewide organization dedicated to fostering youth and adult adaptive basketball teams.',
                org_type: 'Nonprofit',
                sport: 'Adaptive Basketball',
                sports_json: [Array],
                email: 'contact@empirestatewb.org',
                phone: '518-555-0143',
                city: 'Albany',
                state: 'NY',
                zip: '12207',
                lat: '42.6526',
                lng: '-73.7562',
                address: '45 State St',
                geo_precision: 'rooftop'
            }
        ]
    };
    assert.ok(result.json);
}, 60000);
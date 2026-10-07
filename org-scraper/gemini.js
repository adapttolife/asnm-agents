import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import * as locks from './locks.js';

// Gemini keys and sorting by locks to find usable keys
var keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9
].filter(k => k);
var usableKeys = keys.filter(async (_, i) => !(await locks.get(`key_${i}`)));

// Set up Gemini with a key, if any
if (usableKeys.length > 0) {
    var usingKey = usableKeys[0];
    var ai = new GoogleGenAI({ apiKey: usingKey });
};

// Expose the generation function
export async function gen(contents = '', model = 'gemini-3.5-flash-lite', config = {}, grounding = false, schema = null) {
    if (!contents) return 'No contents'; // Require some contents to generate
    if (!ai && (usableKeys.length > 0)) { // Set up Gemini with a key, if any
        usingKey = usableKeys[0];
        ai = new GoogleGenAI({ apiKey: usingKey });
    };
    if (!ai) return 'No usable Gemini keys available'; // Require Gemini to... use Gemini
    var params = {
        ...params,
        model: model || 'gemini-3.5-flash-lite', // Default to Gemini 3.5 Flash Lite
        contents: (typeof contents === 'string') ? { // Accept string or structured contents
            role: "user",
            parts: [
                {
                    text: contents,
                },
            ],
        } : contents,
        config: {
            ...config,
            maxOutputTokens: 5000, // Default to 5000 tokens
            thinkingConfig: {
                thinkingBudget: 1000, // Default to 1000 tokens thinking budget
                includeThoughts: false, // Default to not include thoughts
            },
            tools: [], // Default to no tools
        },
    };
    if (grounding) params.config.tools.push({ // Add grounding tool if requested
        type: 'google_search'
    });
    if (schema) { // Add JSON schema if requested
        params.config.responseMimeType = 'application/json';
        params.config.responseJsonSchema = schema;
    };
    try {
        var response = await ai.models.generateContent(params); // Generate content with Gemini
        if (!response) return null; // Return null if no response
        return {
            text: response?.candidates?.[0]?.content?.parts?.[0]?.text || null, // Return the text of the first candidate
            json: (schema && response?.candidates?.[0]?.content?.parts?.[0]?.text) ? JSON.parse(response?.candidates?.[0]?.content?.parts?.[0]?.text) : null, // Return the JSON of the first candidate if schema is provided
            metadata: response?.usageMetadata || null, // Return the usage metadata
            full: response || null, // Return the full response
        };
    } catch (err) {
        const status = err?.status || err?.response?.status || err?.statusCode || (err?.message && /\\b429\\b/.test(err.message) ? 429 : undefined); // Get the status code from the error
        if (status === 429) { // If rate limited
            await locks.set(`key_${keys.indexOf(usingKey)}`, true); // Lock the current key
            usableKeys = keys.filter(async (_, i) => !(await locks.get(`key_${i}`))); // Update usable keys
            if (usableKeys.length === 0) { // If no usable keys left
                ai = null; // Set ai to null
            } else { // Set up Gemini with the new key
                usingKey = usableKeys[0];
                ai = new GoogleGenAI({ apiKey: usingKey });
            };
        } else {
            console.error('Gemini error:', err);
        };
        return null;
    };
};
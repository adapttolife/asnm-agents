import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import * as locks from './locks.js';

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

var usingKey = usableKeys[0];
var ai = new GoogleGenAI({ apiKey: usingKey });

export async function gen(contents = '', model = 'gemini-3.5-flash-lite', config = {}, grounding = false, schema = null) {
    if (!contents) return 'No contents';
    var params = {
        ...params,
        model: model || 'gemini-3.5-flash-lite',
        contents: (typeof contents === 'string') ? {
            role: "user",
            parts: [
                {
                    text: contents,
                },
            ],
        } : contents,
        config: {
            ...config,
            maxOutputTokens: 5000,
            thinkingConfig: {
                thinkingBudget: 1000,
                includeThoughts: false,
            },
            tools: [],
        },
    };
    if (grounding) params.config.tools.push({
        type: 'google_search'
    });
    if (schema) {
        params.config.responseMimeType = 'application/json';
        params.config.responseJsonSchema = schema;
    };
    if (!ai && (usableKeys.length > 0)) {
        usingKey = usableKeys[0];
        ai = new GoogleGenAI({ apiKey: usingKey });
    };
    try {
        var response = await ai.models.generateContent(params);
        if (!response) return null;
        return {
            text: response?.candidates?.[0]?.content?.parts?.[0]?.text || null,
            json: (schema && response?.candidates?.[0]?.content?.parts?.[0]?.text) ? JSON.parse(response?.candidates?.[0]?.content?.parts?.[0]?.text) : null,
            metadata: response?.usageMetadata || null,
            full: response || null,
        };
    } catch (err) {
        const status = err?.status || err?.response?.status || err?.statusCode || (err?.message && /\\b429\\b/.test(err.message) ? 429 : undefined);
        if (status === 429) {
            await locks.set(`key_${keys.indexOf(usingKey)}`, true);
            usableKeys = keys.filter(async (_, i) => !(await locks.get(`key_${i}`)));
            if (usableKeys.length === 0) {
                ai = null;
            } else {
                usingKey = usableKeys[0];
                ai = new GoogleGenAI({ apiKey: usingKey });
            };
        } else {
            console.error('Gemini error:', err);
        };
        return null;
    };
};
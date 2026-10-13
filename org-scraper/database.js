// Convert SQLite type to JSON type
function sqliteTypeToJsonType(declaredType = "") {
    const type = declaredType.toUpperCase();
    if (type.includes("INT")) return "integer";
    if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB") || type.includes("DEC") || type.includes("NUM")) return "number";
    if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT") || (type === "")) return "string";
    if (type.includes("BLOB")) return "string";
    if (type.includes("BOOL")) return "boolean";
    return "string";
}

// Parse SQLite default value
function parseSqliteDefault(value) {
    const trimmed = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
    return trimmed;
}

const states = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY"
];

const stateNames = [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming"
];

// Get table schema as JSON
export async function tableSchema(tableName, db) {
    if (!tableName) throw new Error("Table name is required");
    if (!db) throw new Error("Database connection is required");
    const sql = `PRAGMA table_info("${String(tableName).replaceAll('"', '""')}")`;
    const { results } = await db.prepare(sql).all();
    if (!results || (results.length === 0)) throw new Error(`Table not found or table has no columns: ${tableName}`);
    const properties = {};
    const required = [];
    for (const column of results) {
        if (column.name === "id") continue;
        if (column.name === "intake_row") continue;
        if (column.name === "internal_notes") continue;
        if (column.name.endsWith("_at")) continue;
        const property = { type: sqliteTypeToJsonType(column.type) };
        if ((column.pk > 0) && column.type.toUpperCase().includes("INT")) property.minimum = 1;
        if (column.dflt_value !== null) property.default = parseSqliteDefault(column.dflt_value);
        properties[column.name] = property;
        if ((column.notnull === 1) || (column.pk > 0)) {
            required.push(column.name);
            if (property.type === "string") property.minLength = 1;
        }
        let enumSql;
        let enums;
        switch (column.name) {
            case "org_type":
                enumSql = 'SELECT DISTINCT org_type FROM organizations';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.org_type);
                enums = enums.filter(e => (e.split(' ').length === 1) && (e === e.toLowerCase()));
                console.log(enums)
                if (enums && (enums.length > 0)) property.enum = enums;
                break;
            case "sport":
                enumSql = 'SELECT DISTINCT name FROM sports';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.name);
                if (enums && (enums.length > 0)) property.enum = ["Multi-Sport", ...enums];
                break;
            case "sport_key":
                enumSql = 'SELECT DISTINCT sport_key FROM sports';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.sport_key);
                if (enums && (enums.length > 0)) property.enum = enums;
                break;
            case "sports_json":
                property.type = "array";
                property.items = {
                    type: "string"
                };
                enumSql = 'SELECT DISTINCT sport_key FROM sports';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.sport_key);
                if (enums && (enums.length > 0)) property.items.enum = enums;
                break;
            case "phone":
                property.pattern = "^[0-9]{3}-[0-9]{3}-[0-9]{4}$";
                break;
            case "zip":
                property.pattern = "^[0-9]{5}$";
                break;
            case "state":
                property.enum = states;
                break;
            case "state_name":
                property.enum = stateNames;
                break;
            case "country":
                property.const = "United States";
                break;
            case "website_url":
                property.pattern = "^https?:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?::\d{1,5})?\/(?:[^\s]*)$";
                break;
            case "geo_precision":
                enumSql = 'SELECT DISTINCT geo_precision FROM organizations';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.geo_precision);
                if (enums && (enums.length > 0)) property.enum = enums;
                break;
            case "cost_note":
                property.$comment = "This field is optional and may contain additional information about costs or fees associated with the organization. Notes should be formatted like the following. GroupName1: CostDescription1. GroupName2: CostDescription2. If there are no costs or fees, this field may be left empty.";
                property.description = "This field is optional and may contain additional information about costs or fees associated with the organization. Notes should be formatted like the following. GroupName1: CostDescription1. GroupName2: CostDescription2. If there are no costs or fees, this field may be left empty.";
                break;
            case "equipment_provided":
                property.enum = [0, 1];
                property.$comment = "If unknown, leave this field empty.";
                property.description = "If unknown, leave this field empty.";
                break;
            case "data_quality_rating":
                enumSql = 'SELECT DISTINCT data_quality_rating FROM organizations';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.data_quality_rating);
                if (enums && (enums.length > 0)) property.enum = enums;
                break;
            case "primary_data_source":
                property.const = "Gemini";
                break;
            case "verification_status":
                property.enum = ["verified", "unverified"];
                property.$comment = "If the website URL is accessible.";
                property.description = "If the website URL is accessible.";
                break;
            case "verification_method":
                property.const = "gemini";
                break;
            case "status":
                enumSql = 'SELECT DISTINCT status FROM organizations';
                ({ results: enums } = await db.prepare(enumSql).all());
                enums = enums.map(e => e.status);
                if (enums && (enums.length > 0)) property.enum = enums;
                break;
            case "is_public":
                property.enum = [0, 1];
                break;
        };
        if ((column.notnull === 0) && (column.pk === 0)) {
            property.type = [property.type, "null"];
            if (property.enum && Array.isArray(property.enum) && (property.enum.length > 0)) property.enum.push(null);
        }
    }
    const schema = {
        type: "array",
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `urn:sqlite:table:${tableName}`,
        title: tableName,
        description: "An array of Adaptive sports organization objects",
        minItems: 1,
        uniqueItems: true,
        items: {
            type: "object",
            properties,
            additionalProperties: false,
        },
    };
    if (required.length > 0) schema.items.required = required;
    return schema;
}

// Get a sample row from a table
export async function sampleRow(tableName, db) {
    if (!tableName) throw new Error("Table name is required");
    if (!db) throw new Error("Database connection is required");
    const sql = `SELECT * FROM "${String(tableName).replaceAll('"', '""')}" LIMIT 1`;
    const { results } = await db.prepare(sql).all();
    return results[0];
}

// Get names of organizations matching the state and sport combination
export async function matchingOrganizations(state, sport, db) {
    if (!state || !sport) throw new Error("State and sport are required");
    if (!db) throw new Error("Database connection is required");
    const sql = `SELECT name FROM organizations WHERE state = ? AND sport_key = ?`;
    const { results } = await db.prepare(sql).bind(state, sport).all();
    return results;
}

// Initialize state-sport lock table (run once per controller initiate, or once per day? as infrequent as possible while keeping existing cron jobs)
export async function initStateSport(db) {
    if (!db) throw new Error("Database connection is required");
    const createTableSql = `CREATE TABLE IF NOT EXISTS state_sport (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        sport TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0,
        last_scraped_at TEXT DEFAULT NULL,
        UNIQUE(state, sport)
    )`;
    await db.prepare(createTableSql).run();
    const sports = await getSports(db);
    for (const state of states) {
        for (const sport of sports) {
            const insertSql = `INSERT OR IGNORE INTO state_sport (state, sport) VALUES (?, ?)`;
            await db.prepare(insertSql).bind(state, sport.name).run();
        }
    }
}

// Add a state-sport lock
export async function addStateSportLock(state, sport, db) {
    if (!state || !sport) throw new Error("State and sport are required");
    if (!db) throw new Error("Database connection is required");
    const insertSql = `INSERT OR IGNORE INTO state_sport (state, sport) VALUES (?, ?)`;
    await db.prepare(insertSql).bind(state, sport).run();
    const updateSql = `UPDATE state_sport SET locked = 1 WHERE state = ? AND sport = ?`;
    await db.prepare(updateSql).bind(state, sport).run();
}

// Remove a state-sport lock
export async function removeStateSportLock(state, sport, db) {
    if (!state || !sport) throw new Error("State and sport are required");
    if (!db) throw new Error("Database connection is required");
    const updateSql = `UPDATE state_sport SET locked = 0, last_scraped_at = ? WHERE state = ? AND sport = ?`;
    await db.prepare(updateSql).bind(state, sport, new Date()).run();
}

// Get all state-sport locks
export async function getStateSportLocks(db) {
    if (!db) throw new Error("Database connection is required");
    const sql = `SELECT * FROM state_sport`;
    const { results } = await db.prepare(sql).all();
    return results;
}

// Get all sports
export async function getSports(db) {
    if (!db) throw new Error("Database connection is required");
    const sql = `SELECT sport_key, name FROM sports`;
    const { results } = await db.prepare(sql).all();
    return results;
}

// Export routes for local Wrangler testing (not used in production Worker)
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const tableName = url.searchParams.get("table");
        const state = url.searchParams.get("state");
        const sport = url.searchParams.get("sport");
        switch (pathname) {
            case "/schema":
                if (!tableName) return new Response(JSON.stringify({ error: "Table name is required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
                try {
                    const schema = await tableSchema(tableName, env.DB);
                    return new Response(JSON.stringify(schema), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/sample":
                if (!tableName) return new Response(JSON.stringify({ error: "Table name is required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
                try {
                    const row = await sampleRow(tableName, env.DB);
                    return new Response(JSON.stringify(row), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/matchingOrganizations":
                if (!state || !sport) return new Response(JSON.stringify({ error: "State and sport are required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
                try {
                    const organizations = await matchingOrganizations(state, sport, env.DB);
                    return new Response(JSON.stringify(organizations), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/initStateSport":
                try {
                    await initStateSport(env.DB);
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/addStateSportLock":
                if (!state || !sport) return new Response(JSON.stringify({ error: "State and sport are required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
                try {
                    await addStateSportLock(state, sport, env.DB);
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/removeStateSportLock":
                if (!state || !sport) return new Response(JSON.stringify({ error: "State and sport are required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
                try {
                    await removeStateSportLock(state, sport, env.DB);
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/stateSportLocks":
                try {
                    const locks = await getStateSportLocks(env.DB);
                    return new Response(JSON.stringify(locks), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            case "/sports":
                try {
                    const sports = await getSports(env.DB);
                    return new Response(JSON.stringify(sports), {
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (err) {
                    console.error(err);
                    return new Response(JSON.stringify({ error: err.message }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            default:
                return new Response(JSON.stringify({ error: "Not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
        }
    },
};

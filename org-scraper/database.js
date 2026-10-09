function sqliteTypeToJsonType(declaredType = "") {
    const type = declaredType.toUpperCase();
    if (type.includes("INT")) return "integer";
    if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB") || type.includes("DEC") || type.includes("NUM")) return "number";
    if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT") || (type === "")) return "string";
    if (type.includes("BLOB")) return "string";
    if (type.includes("BOOL")) return "boolean";
    return "string";
}

function parseSqliteDefault(value) {
    const trimmed = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
    return trimmed;
}

export async function tableSchema(tableName, db) {
    if (!tableName) throw new Error("Table name is required");
    if (!db) throw new Error("Database connection is required");
    const sql = `PRAGMA table_info("${String(tableName).replaceAll('"', '""')}")`;
    const { results } = await db.prepare(sql).all();
    if (!results || results.length === 0) throw new Error(`Table not found or table has no columns: ${tableName}`);
    const properties = {};
    const required = [];
    for (const column of results) {
        const property = { type: sqliteTypeToJsonType(column.type) };
        if ((column.notnull === 0) && (column.pk === 0)) property.type = [property.type, "null"];
        if ((column.pk > 0) && column.type.toUpperCase().includes("INT")) property.minimum = 1;
        if (column.dflt_value !== null) property.default = parseSqliteDefault(column.dflt_value);
        properties[column.name] = property;
        if ((column.notnull === 1) || (column.pk > 0)) required.push(column.name);
    }
    const schema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `urn:sqlite:table:${tableName}`,
        title: tableName,
        type: "object",
        properties,
        additionalProperties: false,
    };
    if (required.length > 0) schema.required = required;
    return schema;
}

export function sampleRow(dbName, tableName) {
    if (!dbName) throw new Error("Database name is required");
    if (!tableName) throw new Error("Table name is required");
    const execFileAsync = promisify(execFile);
    const { stdout, stderr } = execFileAsync(process.execPath, [
        './node_modules/wrangler/bin/wrangler.js',
        'd1',
        'execute',
        dbName,
        '--remote',
        '--command',
        `SELECT * FROM "${String(tableName).replaceAll('"', '""')}" LIMIT 1`,
    ], { cwd: process.cwd() });
    if (stderr) throw new Error(`Error executing command: ${stderr}`);
    console.log(stdout)
    return stdout;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const tableName = url.searchParams.get("table");
        if (!tableName) {
            return new Response(JSON.stringify({ error: "Table name is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        try {
            const schema = await tableSchema(tableName, env.DB);
            return new Response(JSON.stringify(schema), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    },
};

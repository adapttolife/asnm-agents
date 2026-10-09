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

export function toJsonSchema(db, tableName) {
    const columns = db.prepare(`PRAGMA table_info("${String(tableName).replaceAll('"', '""')}")`).all();
    if (columns.length === 0) throw new Error(`Table not found or table has no columns: ${tableName}`);
    const properties = {};
    const required = [];
    for (const column of columns) {
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

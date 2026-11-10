const SEARCH_URL = "https://api.searlo.tech/api/v1/search/batch";
const MAX_QUERIES_PER_BATCH = 10;
const RESULTS_PER_QUERY = 5;
let nextKeyIndex = 0;

function keys() {
  return [process.env.SEARLO_API_KEY, ...(process.env.SEARLO_API_KEYS || "").split(",")]
    .map((key) => String(key || "").trim())
    .filter(Boolean);
}

function queryFor(row) {
  const name = `"${String(row.name || "").replaceAll('"', "")}"`;
  const location = [row.city, row.state].filter(Boolean).join(" ");
  return [name, location, "adaptive sports"].filter(Boolean).join(" ");
}

function chunks(rows) {
  return Array.from({ length: Math.ceil(rows.length / MAX_QUERIES_PER_BATCH) }, (_, index) => rows.slice(index * MAX_QUERIES_PER_BATCH, (index + 1) * MAX_QUERIES_PER_BATCH));
}

function sources(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, RESULTS_PER_QUERY)
    .map((item) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.link || item?.url || "").trim(),
      text: String(item?.snippet || item?.description || "").trim(),
    }))
    .filter((item) => /^https?:\/\//i.test(item.url) && item.text);
}

async function searchBatch(rows) {
  const available = keys();
  if (!available.length) throw new Error("Set SEARLO_API_KEY before running org-filler");
  const apiKey = available[nextKeyIndex++ % available.length];
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ queries: rows.map(queryFor) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`Searlo search failed (${response.status}): ${body?.message || body?.error || "unknown error"}`);
  const data = Array.isArray(body.data) ? body.data : [];
  return new Map(rows.map((row, index) => [row.id, sources(data[index]?.items)]));
}

export async function searchOrganizations(rows) {
  const found = new Map();
  for (const batch of chunks(rows)) {
    const result = await searchBatch(batch);
    for (const [id, values] of result) found.set(id, values);
  }
  return found;
}
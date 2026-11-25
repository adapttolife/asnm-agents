import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DISCOVERY_RESULT_LIMIT, SEARCH_ENGINES, SEARCH_INTERVAL_MS } from "./config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function results(payload) {
  const values = Array.isArray(payload) ? payload : payload?.results || payload?.data?.results || payload?.data || [];
  return values.map((item) => ({
    title: String(item?.title || "").trim(),
    url: String(item?.url || item?.link || "").trim(),
    description: String(item?.description || item?.snippet || "").trim()
  })).filter((item) => /^https?:\/\//i.test(item.url) && item.title);
}

export class OpenWebSearch {
  constructor() {
    this.baseUrl = process.env.OPEN_WEBSEARCH_URL || `http://127.0.0.1:${process.env.OPEN_WEBSEARCH_PORT || 3211}`;
    this.child = null;
    this.lastSearchAt = 0;
  }
  async healthy() { try { return (await fetch(`${this.baseUrl}/health`)).ok; } catch { return false; } }
  async start() {
    if (await this.healthy()) return;
    const entry = fileURLToPath(new URL("./node_modules/open-websearch/build/index.js", import.meta.url));
    this.child = spawn(process.execPath, [entry, "serve", "--port", String(new URL(this.baseUrl).port)], {
      env: {
        ...process.env,
        MODE: "http",
        DEFAULT_SEARCH_ENGINE: SEARCH_ENGINES[0],
        ALLOWED_SEARCH_ENGINES: SEARCH_ENGINES.join(",")
      },
      stdio: "ignore"
    });
    for (let attempt = 0; attempt < 120; attempt++) { if (await this.healthy()) return; await wait(500); }
    this.child?.kill();
    throw new Error("open-websearch did not become ready");
  }
  async search(query) {
    const pause = Math.max(0, SEARCH_INTERVAL_MS - (Date.now() - this.lastSearchAt));
    if (pause) await wait(pause);
    const response = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        limit: DISCOVERY_RESULT_LIMIT,
        engines: SEARCH_ENGINES
      })
    });
    this.lastSearchAt = Date.now();
    if (!response.ok) throw new Error(`open-websearch failed with HTTP ${response.status}`);
    return results(await response.json());
  }
  async close() { this.child?.kill(); this.child = null; }
}

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SEARCH_INTERVAL_MS } from "./config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalResults(payload) {
  const values = Array.isArray(payload) ? payload : payload?.results || payload?.data?.results || payload?.data || [];
  return values.map((item) => ({
    title: item?.title || "",
    url: item?.url || item?.link || "",
    description: item?.description || item?.snippet || ""
  })).filter((item) => /^https?:\/\//i.test(item.url));
}

export class OpenWebSearch {
  constructor() {
    this.baseUrl = process.env.OPEN_WEBSEARCH_URL || `http://127.0.0.1:${process.env.OPEN_WEBSEARCH_PORT || 3210}`;
    this.child = null;
    this.lastSearchAt = 0;
  }

  async start() {
    if (await this.healthy()) return;
    const entry = fileURLToPath(new URL("./node_modules/open-websearch/build/index.js", import.meta.url));
    this.child = spawn(process.execPath, [entry, "serve", "--port", String(new URL(this.baseUrl).port)], {
      env: {
        ...process.env,
        MODE: "http",
        DEFAULT_SEARCH_ENGINE: process.env.OPEN_WEBSEARCH_ENGINE || "duckduckgo",
        ALLOWED_SEARCH_ENGINES: process.env.OPEN_WEBSEARCH_ENGINE || "duckduckgo"
      },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await this.healthy()) return;
      await wait(500);
    }
    this.child.kill();
    throw new Error("open-websearch did not become ready");
  }

  async healthy() {
    try {
      return (await fetch(`${this.baseUrl}/health`)).ok;
    } catch {
      return false;
    }
  }

  async search(query) {
    const pause = Math.max(0, SEARCH_INTERVAL_MS - (Date.now() - this.lastSearchAt));
    if (pause) await wait(pause);
    const response = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 5,
        engines: [process.env.OPEN_WEBSEARCH_ENGINE || "duckduckgo"]
      })
    });
    this.lastSearchAt = Date.now();
    if (!response.ok) throw new Error(`open-websearch failed with HTTP ${response.status}`);
    return normalResults(await response.json());
  }

  async close() {
    this.child?.kill();
    this.child = null;
  }
}

export function searchQuery(row) {
  return [row.name, row.city, row.state, "adaptive sports"].filter(Boolean).join(" ");
}

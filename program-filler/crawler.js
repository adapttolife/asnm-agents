import { MAX_CRAWL_DURATION_MS, MAX_SITE_PAGES, SITE_REQUEST_INTERVAL_MS } from "./config.js";
import { internalLinks, pageToMarkdown } from "./markdown.js";

const USER_AGENT = "ASNMOrgFiller/2.0 (+https://adaptivesportsnearme.com)";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function requestPage(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(20_000, timeoutMs));
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/html|xhtml/i.test(contentType)) throw new Error(`HTTP ${response.status} ${contentType}`);
    return { url: response.url, html: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

export async function crawlSite(siteUrl, { onProgress = async () => { } } = {}) {
  const root = publicUrl(siteUrl);
  if (!root) throw new Error("The website URL is not a public HTTP(S) URL");
  const queue = [root.href];
  const visited = new Set();
  const pages = [];
  const deadline = Date.now() + MAX_CRAWL_DURATION_MS;
  let origin = root.origin;
  while (queue.length && (pages.length < MAX_SITE_PAGES)) {
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);
    if (pages.length) await wait(SITE_REQUEST_INTERVAL_MS);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await onProgress(`crawler fetching page ${visited.size}/${MAX_SITE_PAGES}: ${next}`);
    let result;
    try {
      result = await requestPage(next, remaining);
    } catch (error) {
      if (!pages.length) throw error;
      continue;
    }
    const finalUrl = publicUrl(result.url);
    if (!finalUrl) continue;
    if (!pages.length) origin = finalUrl.origin;
    if (finalUrl.origin !== origin) continue;
    const { title, markdown } = pageToMarkdown(result.html, finalUrl.href);
    if (markdown) pages.push({ url: finalUrl.href, title, markdown });
    for (const link of internalLinks(result.html, finalUrl.href, origin)) if (!visited.has(link) && !queue.includes(link)) queue.push(link);
  }
  if (!pages.length) throw new Error((Date.now() >= deadline) ? `Crawl timed out after ${MAX_CRAWL_DURATION_MS}ms` : "No readable HTML pages were found");
  return {
    websiteUrl: pages[0].url,
    pages,
    method: "http"
  };
}

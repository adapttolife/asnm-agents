import { chromium } from "playwright-core";
import { pageToMarkdown } from "./markdown.js";

const executableCandidates = [
  process.env.BROWSER_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);

export async function scrapeWithBrowser(url) {
  let lastError;
  for (const executablePath of executableCandidates) {
    let browser;
    try {
      browser = await chromium.launch({ executablePath, headless: process.env.BROWSER_HEADLESS === "true" });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const finalUrl = page.url();
      const html = await page.content();
      const { title, markdown } = pageToMarkdown(html, finalUrl);
      if (!markdown) throw new Error("The browser rendered no readable page text");
      return { websiteUrl: finalUrl, pages: [{ url: finalUrl, title, markdown }], method: "browser" };
    } catch (error) {
      lastError = error;
    } finally {
      await browser?.close().catch(() => { });
    }
  }
  throw lastError || new Error("No Chromium executable is configured");
}
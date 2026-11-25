import * as cheerio from "cheerio";
import TurndownService from "turndown";

const turndown = new TurndownService({ codeBlockStyle: "fenced", bulletListMarker: "-" });

export function pageToMarkdown(html, url) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, header, form").remove();
  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (href) $(element).attr("href", new URL(href, url).href);
  });
  const title = $("title").first().text().trim();
  const body = $("main, article, [role=main]").first().html() || $("body").html() || "";
  const markdown = turndown.turndown(body).replace(/\n{3,}/g, "\n\n").trim();
  return { title, markdown };
}

export function internalLinks(html, pageUrl, origin) {
  const $ = cheerio.load(html);
  return [...new Set($("a[href]").map((_, element) => {
    try {
      const url = new URL($(element).attr("href"), pageUrl);
      url.hash = "";
      if ((url.origin !== origin) || !/^https?:$/.test(url.protocol)) return null;
      if (/\.(?:css|js|json|xml|pdf|png|jpe?g|gif|svg|webp|zip|mp4|mp3)$/i.test(url.pathname)) return null;
      return url.href;
    } catch {
      return null;
    }
  }).get().filter(Boolean))];
}
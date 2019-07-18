import * as cheerio from "cheerio";
import type { AuditIssue, PageData, LinkInfo } from "../types.js";

export class HTMLAuditor {
  audit(page: PageData): { issues: AuditIssue[]; links: LinkInfo[] } {
    const $ = cheerio.load(page.html);
    const issues: AuditIssue[] = [];

    // DOCTYPE
    if (!page.html.trim().toLowerCase().startsWith("<!doctype html")) {
      issues.push({ category: "html", severity: "warning", rule: "no-doctype", message: "Page is missing <!DOCTYPE html>" });
    }

    // Charset
    if (!$("meta[charset]").length && !$('meta[http-equiv="Content-Type"]').length) {
      issues.push({ category: "html", severity: "warning", rule: "no-charset", message: "Missing character encoding declaration" });
    }

    // Duplicate IDs
    const ids = new Map<string, number>();
    $("[id]").each((_, el) => {
      const id = $(el).attr("id")!;
      ids.set(id, (ids.get(id) || 0) + 1);
    });
    const duplicates = [...ids.entries()].filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      issues.push({
        category: "html", severity: "warning", rule: "duplicate-ids",
        message: `${duplicates.length} duplicate IDs found: ${duplicates.map(([id]) => id).slice(0, 5).join(", ")}`,
      });
    }

    // Deprecated tags
    const deprecated = ["center", "font", "marquee", "blink", "frame", "frameset"];
    for (const tag of deprecated) {
      if ($(tag).length > 0) {
        issues.push({ category: "html", severity: "warning", rule: "deprecated-tag", message: `Deprecated <${tag}> tag found (${$(tag).length} occurrence(s))` });
      }
    }

    // Empty tags
    const emptyTags = $("p, span, div").filter((_, el) => {
      return $(el).text().trim() === "" && $(el).children().length === 0;
    }).length;
    if (emptyTags > 5) {
      issues.push({ category: "html", severity: "info", rule: "empty-tags", message: `${emptyTags} empty elements found` });
    }

    // Links
    const links = this.extractLinks($, page.url);

    // Broken link patterns
    const hashLinks = links.filter((l) => l.href === "#" || l.href === "");
    if (hashLinks.length > 0) {
      issues.push({ category: "html", severity: "info", rule: "empty-href", message: `${hashLinks.length} links with empty or "#" href` });
    }

    return { issues, links };
  }

  private extractLinks($: cheerio.CheerioAPI, pageUrl: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    const pageHost = new URL(pageUrl).hostname;

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().substring(0, 100);
      const rel = $(el).attr("rel") || "";

      let isExternal = false;
      try {
        const linkUrl = new URL(href, pageUrl);
        isExternal = linkUrl.hostname !== pageHost;
      } catch {}

      links.push({
        href,
        text,
        isExternal,
        hasNofollow: rel.includes("nofollow"),
      });
    });

    return links;
  }
}

import * as cheerio from "cheerio";
import type { AuditIssue, PageData } from "../types.js";

export class AccessibilityAuditor {
  audit(page: PageData): AuditIssue[] {
    const $ = cheerio.load(page.html);
    const issues: AuditIssue[] = [];

    // Images without alt
    const imagesNoAlt: string[] = [];
    $("img").each((_, el) => {
      const alt = $(el).attr("alt");
      if (alt === undefined) imagesNoAlt.push($(el).attr("src") || "unknown");
    });
    if (imagesNoAlt.length > 0) {
      issues.push({
        category: "accessibility", severity: "critical", rule: "img-alt",
        message: `${imagesNoAlt.length} image(s) missing alt attribute`,
        value: imagesNoAlt.slice(0, 3).join(", "),
      });
    }

    // Empty links
    const emptyLinks: number = $("a").filter((_, el) => {
      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label");
      const title = $(el).attr("title");
      return !text && !ariaLabel && !title && !$(el).find("img").length;
    }).length;
    if (emptyLinks > 0) {
      issues.push({ category: "accessibility", severity: "warning", rule: "empty-links", message: `${emptyLinks} link(s) have no accessible text` });
    }

    // Form inputs without labels
    const unlabeledInputs = $("input:not([type=hidden]):not([type=submit]):not([type=button])").filter((_, el) => {
      const id = $(el).attr("id");
      const ariaLabel = $(el).attr("aria-label");
      const ariaLabelledby = $(el).attr("aria-labelledby");
      const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
      return !ariaLabel && !ariaLabelledby && !hasLabel;
    }).length;
    if (unlabeledInputs > 0) {
      issues.push({ category: "accessibility", severity: "critical", rule: "input-labels", message: `${unlabeledInputs} form input(s) without associated labels` });
    }

    // Missing lang attribute
    if (!$("html").attr("lang")) {
      issues.push({ category: "accessibility", severity: "critical", rule: "html-lang", message: "Missing lang attribute on <html> element" });
    }

    // Skip navigation
    const skipLink = $('a[href^="#"]').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes("skip") || text.includes("main content");
    });
    if (skipLink.length === 0) {
      issues.push({ category: "accessibility", severity: "info", rule: "skip-nav", message: "No skip navigation link found" });
    }

    // Buttons without accessible text
    const emptyButtons = $("button").filter((_, el) => {
      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label");
      return !text && !ariaLabel;
    }).length;
    if (emptyButtons > 0) {
      issues.push({ category: "accessibility", severity: "warning", rule: "button-text", message: `${emptyButtons} button(s) without accessible text` });
    }

    // Tabindex > 0
    const badTabindex = $("[tabindex]").filter((_, el) => {
      const val = parseInt($(el).attr("tabindex") || "0");
      return val > 0;
    }).length;
    if (badTabindex > 0) {
      issues.push({ category: "accessibility", severity: "warning", rule: "tabindex", message: `${badTabindex} element(s) with tabindex > 0 (can break tab order)` });
    }

    // ARIA roles
    $("[role]").each((_, el) => {
      const role = $(el).attr("role");
      const validRoles = ["banner", "navigation", "main", "complementary", "contentinfo", "form", "search", "alert", "dialog", "button", "link", "list", "listitem", "tab", "tabpanel", "tablist", "menu", "menuitem", "region", "img", "heading", "presentation", "none", "status"];
      if (role && !validRoles.includes(role)) {
        issues.push({ category: "accessibility", severity: "info", rule: "aria-role", message: `Unknown ARIA role: "${role}"`, selector: $(el).prop("tagName")?.toLowerCase() });
      }
    });

    return issues;
  }
}

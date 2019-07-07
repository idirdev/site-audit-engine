import * as cheerio from "cheerio";
import type { AuditIssue, PageData, PageMeta } from "../types.js";

export class SEOAuditor {
  audit(page: PageData): { issues: AuditIssue[]; meta: PageMeta } {
    const $ = cheerio.load(page.html);
    const issues: AuditIssue[] = [];
    const meta = this.extractMeta($, page.url);

    // Title
    if (!meta.title) {
      issues.push({ category: "seo", severity: "critical", rule: "missing-title", message: "Page is missing a <title> tag" });
    } else if (meta.titleLength < 20) {
      issues.push({ category: "seo", severity: "warning", rule: "short-title", message: `Title is too short (${meta.titleLength} chars, recommended 50-60)`, value: meta.title });
    } else if (meta.titleLength > 60) {
      issues.push({ category: "seo", severity: "warning", rule: "long-title", message: `Title is too long (${meta.titleLength} chars, recommended 50-60)`, value: meta.title });
    }

    // Meta description
    if (!meta.description) {
      issues.push({ category: "seo", severity: "critical", rule: "missing-description", message: "Page is missing a meta description" });
    } else if (meta.descriptionLength < 70) {
      issues.push({ category: "seo", severity: "warning", rule: "short-description", message: `Meta description is too short (${meta.descriptionLength} chars, recommended 150-160)` });
    } else if (meta.descriptionLength > 160) {
      issues.push({ category: "seo", severity: "warning", rule: "long-description", message: `Meta description is too long (${meta.descriptionLength} chars, recommended 150-160)` });
    }

    // H1
    if (meta.h1Count === 0) {
      issues.push({ category: "seo", severity: "critical", rule: "missing-h1", message: "Page is missing an <h1> heading" });
    } else if (meta.h1Count > 1) {
      issues.push({ category: "seo", severity: "warning", rule: "multiple-h1", message: `Page has ${meta.h1Count} <h1> tags (recommended: 1)` });
    }

    // Canonical
    if (!meta.canonical) {
      issues.push({ category: "seo", severity: "warning", rule: "missing-canonical", message: "Page is missing a canonical URL" });
    }

    // Open Graph
    if (!meta.ogTitle) {
      issues.push({ category: "seo", severity: "info", rule: "missing-og-title", message: "Missing og:title meta tag" });
    }
    if (!meta.ogDescription) {
      issues.push({ category: "seo", severity: "info", rule: "missing-og-description", message: "Missing og:description meta tag" });
    }
    if (!meta.ogImage) {
      issues.push({ category: "seo", severity: "warning", rule: "missing-og-image", message: "Missing og:image — social shares will lack a preview image" });
    }

    // Viewport
    if (!meta.viewport) {
      issues.push({ category: "seo", severity: "critical", rule: "missing-viewport", message: "Missing viewport meta tag (not mobile-friendly)" });
    }

    // Language
    if (!meta.lang) {
      issues.push({ category: "seo", severity: "warning", rule: "missing-lang", message: "Missing lang attribute on <html>" });
    }

    // Heading hierarchy
    const levels = meta.headings.map((h) => h.level);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) {
        issues.push({
          category: "seo",
          severity: "warning",
          rule: "heading-skip",
          message: `Heading hierarchy skips from h${levels[i - 1]} to h${levels[i]}`,
        });
        break;
      }
    }

    // Word count
    if (meta.wordCount < 300) {
      issues.push({ category: "seo", severity: "info", rule: "thin-content", message: `Page has only ${meta.wordCount} words (thin content)` });
    }

    return { issues, meta };
  }

  private extractMeta($: cheerio.CheerioAPI, url: string): PageMeta {
    const title = $("title").text() || null;
    const h1Elements = $("h1");
    const headings: { level: number; text: string }[] = [];
    $("h1, h2, h3, h4, h5, h6").each((_, el) => {
      const tagName = (el as cheerio.Element).tagName;
      headings.push({
        level: parseInt(tagName.charAt(1)),
        text: $(el).text().trim().substring(0, 80),
      });
    });

    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    return {
      title,
      titleLength: title?.length || 0,
      description: $('meta[name="description"]').attr("content") || null,
      descriptionLength: $('meta[name="description"]').attr("content")?.length || 0,
      canonical: $('link[rel="canonical"]').attr("href") || null,
      ogTitle: $('meta[property="og:title"]').attr("content") || null,
      ogDescription: $('meta[property="og:description"]').attr("content") || null,
      ogImage: $('meta[property="og:image"]').attr("content") || null,
      twitterCard: $('meta[name="twitter:card"]').attr("content") || null,
      viewport: $('meta[name="viewport"]').attr("content") || null,
      charset: $("meta[charset]").attr("charset") || null,
      lang: $("html").attr("lang") || null,
      robots: $('meta[name="robots"]').attr("content") || null,
      favicon: $('link[rel="icon"]').attr("href") || $('link[rel="shortcut icon"]').attr("href") || null,
      h1Count: h1Elements.length,
      h1Text: h1Elements.map((_, el) => $(el).text().trim()).get(),
      wordCount: bodyText.split(/\s+/).length,
      headings,
    };
  }
}

import * as cheerio from "cheerio";
import type { AuditIssue, PageData, ImageInfo } from "../types.js";

export class PerformanceAuditor {
  audit(page: PageData): { issues: AuditIssue[]; images: ImageInfo[] } {
    const $ = cheerio.load(page.html);
    const issues: AuditIssue[] = [];
    const images = this.extractImages($);

    // Response time
    if (page.responseTimeMs > 3000) {
      issues.push({ category: "performance", severity: "critical", rule: "slow-response", message: `Response time is ${page.responseTimeMs}ms (should be under 3s)` });
    } else if (page.responseTimeMs > 1000) {
      issues.push({ category: "performance", severity: "warning", rule: "slow-response", message: `Response time is ${page.responseTimeMs}ms (aim for under 1s)` });
    }

    // Page size
    const sizeKB = Math.round(page.contentLength / 1024);
    if (sizeKB > 500) {
      issues.push({ category: "performance", severity: "critical", rule: "large-page", message: `HTML is ${sizeKB}KB (should be under 500KB)` });
    } else if (sizeKB > 200) {
      issues.push({ category: "performance", severity: "warning", rule: "large-page", message: `HTML is ${sizeKB}KB (aim for under 200KB)` });
    }

    // Inline styles
    const inlineStyles = $("[style]").length;
    if (inlineStyles > 10) {
      issues.push({ category: "performance", severity: "warning", rule: "inline-styles", message: `${inlineStyles} elements have inline styles (consider external CSS)` });
    }

    // Scripts
    const scripts = $("script[src]");
    if (scripts.length > 15) {
      issues.push({ category: "performance", severity: "warning", rule: "too-many-scripts", message: `${scripts.length} external scripts found (consider bundling)` });
    }

    // Render-blocking scripts in head
    const blockingScripts = $("head script[src]:not([async]):not([defer])").length;
    if (blockingScripts > 0) {
      issues.push({ category: "performance", severity: "warning", rule: "render-blocking", message: `${blockingScripts} render-blocking scripts in <head> (add async/defer)` });
    }

    // Images without dimensions
    const noDimensions = images.filter((img) => !img.width && !img.height);
    if (noDimensions.length > 0) {
      issues.push({ category: "performance", severity: "info", rule: "no-image-dimensions", message: `${noDimensions.length} images missing width/height (causes layout shift)` });
    }

    // Images without lazy loading
    const noLazy = images.filter((img) => !img.hasLazyLoad);
    if (noLazy.length > 5) {
      issues.push({ category: "performance", severity: "info", rule: "no-lazy-load", message: `${noLazy.length} images without lazy loading` });
    }

    // CSS files
    const cssFiles = $('link[rel="stylesheet"]').length;
    if (cssFiles > 5) {
      issues.push({ category: "performance", severity: "warning", rule: "too-many-css", message: `${cssFiles} CSS files (consider combining)` });
    }

    return { issues, images };
  }

  private extractImages($: cheerio.CheerioAPI): ImageInfo[] {
    const images: ImageInfo[] = [];
    $("img").each((_, el) => {
      const $el = $(el);
      images.push({
        src: $el.attr("src") || "",
        alt: $el.attr("alt") ?? null,
        width: $el.attr("width") || null,
        height: $el.attr("height") || null,
        hasLazyLoad: $el.attr("loading") === "lazy",
      });
    });
    return images;
  }
}

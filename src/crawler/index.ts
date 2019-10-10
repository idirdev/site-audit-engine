import type { PageData, AuditConfig } from "../types.js";

const DEFAULT_UA =
  "SiteAuditEngine/1.0 (+https://github.com/idirdev/site-audit-engine)";

export class Crawler {
  private config: AuditConfig;

  constructor(config: Partial<AuditConfig> & { url: string }) {
    this.config = {
      followRedirects: true,
      timeout: 15000,
      userAgent: DEFAULT_UA,
      checkLinks: false,
      maxDepth: 1,
      maxPages: 50,
      ...config,
    };
  }

  async fetch(url?: string): Promise<PageData> {
    const targetUrl = url || this.config.url;
    const startTime = Date.now();
    const redirectChain: string[] = [];
    let currentUrl = targetUrl;

    const response = await fetch(currentUrl, {
      headers: { "User-Agent": this.config.userAgent },
      redirect: this.config.followRedirects ? "follow" : "manual",
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (response.redirected) {
      redirectChain.push(targetUrl);
      currentUrl = response.url;
    }

    const html = await response.text();
    const responseTimeMs = Date.now() - startTime;

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      url: currentUrl,
      statusCode: response.status,
      responseTimeMs,
      contentType: headers["content-type"] || "",
      contentLength: parseInt(headers["content-length"] || "0") || html.length,
      html,
      headers,
      redirectChain,
    };
  }

  /**
   * Extract all same-origin href links from an HTML string relative to baseUrl.
   * Returns absolute URLs, deduplicated, fragments and query-stripped for
   * cycle-detection purposes — but the returned URLs are the canonical
   * absolute form (no fragment, no trailing slash normalisation beyond what
   * the URL parser does).
   */
  extractInternalLinks(html: string, baseUrl: string): string[] {
    const origin = new URL(baseUrl).origin;
    const seen = new Set<string>();
    const links: string[] = [];

    // Simple regex over href attributes — avoids a cheerio dependency here
    // (cheerio is already used in auditors; this keeps the crawler lean).
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefRe.exec(html)) !== null) {
      const raw = match[1].trim();

      // Skip anchors, mailto, tel, javascript
      if (
        raw.startsWith("#") ||
        raw.startsWith("mailto:") ||
        raw.startsWith("tel:") ||
        raw.startsWith("javascript:")
      ) {
        continue;
      }

      let resolved: URL;
      try {
        resolved = new URL(raw, baseUrl);
      } catch {
        continue;
      }

      // Only same-origin
      if (resolved.origin !== origin) continue;

      // Normalise: strip fragment
      resolved.hash = "";
      const href = resolved.href;

      if (!seen.has(href)) {
        seen.add(href);
        links.push(href);
      }
    }

    return links;
  }

  /**
   * Crawl the site starting from `config.url`, following internal links up to
   * `config.maxDepth` levels deep and visiting at most `config.maxPages` pages.
   *
   * Returns an array of PageData, one entry per successfully fetched page.
   * Pages that fail to fetch (network error, non-2xx, non-HTML) are skipped.
   */
  async crawl(): Promise<PageData[]> {
    const { maxDepth, maxPages } = this.config;
    const startUrl = this.config.url;

    const visited = new Set<string>();
    const results: PageData[] = [];

    // Queue entries: [url, depth]
    const queue: Array<[string, number]> = [[startUrl, 0]];

    while (queue.length > 0 && results.length < maxPages) {
      const [url, depth] = queue.shift()!;

      // Normalise for visited tracking (strip fragment)
      let normUrl: string;
      try {
        const u = new URL(url);
        u.hash = "";
        normUrl = u.href;
      } catch {
        continue;
      }

      if (visited.has(normUrl)) continue;
      visited.add(normUrl);

      let page: PageData;
      try {
        page = await this.fetch(url);
      } catch {
        // Skip pages that fail to load
        continue;
      }

      // Only process HTML pages
      if (!page.contentType.includes("text/html")) continue;

      results.push(page);

      // Stop following links when we have reached maxDepth
      if (depth < maxDepth) {
        const links = this.extractInternalLinks(page.html, page.url);
        for (const link of links) {
          if (!visited.has(link) && results.length + queue.length < maxPages) {
            queue.push([link, depth + 1]);
          }
        }
      }
    }

    return results;
  }

  async checkUrl(url: string): Promise<number> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.config.userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      return response.status;
    } catch {
      return 0;
    }
  }
}

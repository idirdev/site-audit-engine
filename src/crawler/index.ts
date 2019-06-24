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

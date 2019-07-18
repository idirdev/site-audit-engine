import type { AuditIssue, PageData, HeaderInfo } from "../types.js";

export class SecurityAuditor {
  audit(page: PageData): { issues: AuditIssue[]; headers: HeaderInfo } {
    const issues: AuditIssue[] = [];
    const h = page.headers;

    const headers: HeaderInfo = {
      hasHSTS: !!h["strict-transport-security"],
      hasCSP: !!h["content-security-policy"],
      hasXFrame: !!h["x-frame-options"],
      hasXContent: !!h["x-content-type-options"],
      hasReferrer: !!h["referrer-policy"],
      hasPermissions: !!h["permissions-policy"],
      server: h["server"] || null,
      poweredBy: h["x-powered-by"] || null,
    };

    // HTTPS check
    if (!page.url.startsWith("https://")) {
      issues.push({ category: "security", severity: "critical", rule: "no-https", message: "Page is not served over HTTPS" });
    }

    // HSTS
    if (!headers.hasHSTS) {
      issues.push({ category: "security", severity: "critical", rule: "no-hsts", message: "Missing Strict-Transport-Security header" });
    }

    // CSP
    if (!headers.hasCSP) {
      issues.push({ category: "security", severity: "warning", rule: "no-csp", message: "Missing Content-Security-Policy header" });
    }

    // X-Frame-Options
    if (!headers.hasXFrame) {
      issues.push({ category: "security", severity: "warning", rule: "no-xframe", message: "Missing X-Frame-Options header (clickjacking risk)" });
    }

    // X-Content-Type-Options
    if (!headers.hasXContent) {
      issues.push({ category: "security", severity: "warning", rule: "no-xcontent", message: "Missing X-Content-Type-Options header" });
    }

    // Referrer-Policy
    if (!headers.hasReferrer) {
      issues.push({ category: "security", severity: "info", rule: "no-referrer", message: "Missing Referrer-Policy header" });
    }

    // Permissions-Policy
    if (!headers.hasPermissions) {
      issues.push({ category: "security", severity: "info", rule: "no-permissions", message: "Missing Permissions-Policy header" });
    }

    // Server header leaking info
    if (headers.server) {
      issues.push({ category: "security", severity: "info", rule: "server-header", message: `Server header exposes: "${headers.server}"` });
    }

    // X-Powered-By leaking info
    if (headers.poweredBy) {
      issues.push({ category: "security", severity: "warning", rule: "powered-by", message: `X-Powered-By leaks technology: "${headers.poweredBy}"` });
    }

    // Mixed content
    if (page.url.startsWith("https://") && page.html.includes('http://')) {
      const httpRefs = (page.html.match(/http:\/\/[^"'\s]+/g) || [])
        .filter((u) => !u.includes("http://www.w3.org") && !u.includes("http://xmlns"));
      if (httpRefs.length > 0) {
        issues.push({
          category: "security", severity: "warning", rule: "mixed-content",
          message: `${httpRefs.length} potential mixed content reference(s) found`,
        });
      }
    }

    return { issues, headers };
  }
}

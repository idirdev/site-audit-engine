#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { Crawler } from "../crawler/index.js";
import { SEOAuditor } from "../auditors/seo.js";
import { PerformanceAuditor } from "../auditors/performance.js";
import { AccessibilityAuditor } from "../auditors/accessibility.js";
import { SecurityAuditor } from "../auditors/security.js";
import { HTMLAuditor } from "../auditors/html.js";
import { ConsoleReporter } from "../reporters/console.js";
import { JsonReporter } from "../reporters/json.js";
import type { AuditResult, AuditIssue, CategoryScore, PageData, MultiPageAuditResult } from "../types.js";

const program = new Command();

program
  .name("site-audit")
  .description("Audit any website for SEO, performance, accessibility, and security issues")
  .version("1.0.0");

program
  .command("scan")
  .description("Run a full audit on a URL")
  .argument("<url>", "URL to audit")
  .option("-o, --output <file>", "Export results to JSON file")
  .option("--category <cat>", "Only run specific category")
  .option("--timeout <ms>", "Request timeout in ms", "15000")
  .option("--max-depth <n>", "Crawl depth (0 = single page)", "0")
  .option("--max-pages <n>", "Max pages to crawl (default 50 for multi-page)", "0")
  .action(async (url: string, opts) => {
    const startTime = Date.now();
    const maxDepth = parseInt(opts.maxDepth);
    const maxPagesOpt = parseInt(opts.maxPages);
    const isMultiPage = maxDepth > 0;
    const maxPages = maxPagesOpt > 0 ? maxPagesOpt : isMultiPage ? 50 : 1;
    const spinMsg = isMultiPage
      ? "Crawling " + url + " (maxDepth=" + maxDepth + ", maxPages=" + maxPages + ")..."
      : "Fetching " + url + "...";
    const spinner = ora(spinMsg).start();
    try {
      const crawler = new Crawler({ url, timeout: parseInt(opts.timeout), maxDepth, maxPages });
      let pages: PageData[];
      if (isMultiPage) {
        spinner.text = "Crawling pages...";
        pages = await crawler.crawl();
        spinner.text = "Crawled " + pages.length + " page(s). Running audits...";
      } else {
        const page = await crawler.fetch();
        pages = [page];
        spinner.text = "Running audits...";
      }
      const auditResults: AuditResult[] = [];
      for (const page of pages) {
        auditResults.push(auditPage(page, opts.category, startTime));
      }
      const totalDurationMs = Date.now() - startTime;
      spinner.succeed("Audit complete in " + totalDurationMs + "ms (" + auditResults.length + " page(s))");
      if (isMultiPage && auditResults.length > 1) {
        renderMultiPageResults(auditResults, url, totalDurationMs);
        if (opts.output) {
          const multiResult: MultiPageAuditResult = buildMultiPageResult(url, auditResults, totalDurationMs);
          new JsonReporter().export(multiResult as any, opts.output);
          console.log(chalk.green("  Report saved to " + opts.output + "
"));
        }
      } else {
        new ConsoleReporter().render(auditResults[0]);
        if (opts.output) {
          new JsonReporter().export(auditResults[0], opts.output);
          console.log(chalk.green("  Report saved to " + opts.output + "
"));
        }
      }
    } catch (error: any) {
      spinner.fail("Failed to audit " + url + ": " + error.message);
      process.exit(1);
    }
  });

program
  .command("headers")
  .description("Check security headers only")
  .argument("<url>", "URL to check")
  .action(async (url: string) => {
    const spinner = ora("Checking " + url + "...").start();
    const crawler = new Crawler({ url });
    const page = await crawler.fetch();
    const { headers } = new SecurityAuditor().audit(page);
    spinner.succeed("Done");
    console.log(chalk.hex("#06b6d4").bold("
  SECURITY HEADERS
"));
    const check = (name: string, present: boolean) =>
      console.log("  " + (present ? chalk.green("✓") : chalk.red("✗")) + " " + name);
    check("Strict-Transport-Security", headers.hasHSTS);
    check("Content-Security-Policy", headers.hasCSP);
    check("X-Frame-Options", headers.hasXFrame);
    check("X-Content-Type-Options", headers.hasXContent);
    check("Referrer-Policy", headers.hasReferrer);
    check("Permissions-Policy", headers.hasPermissions);
    if (headers.server) console.log(chalk.yellow("  ! Server: " + headers.server));
    if (headers.poweredBy) console.log(chalk.yellow("  ! X-Powered-By: " + headers.poweredBy));
    console.log();
  });

// helpers

function auditPage(page: PageData, category: string | undefined, startTime: number): AuditResult {
  const allIssues: AuditIssue[] = [];
  let meta: any, images: any, links: any, headers: any;
  if (!category || category === "seo") { const r = new SEOAuditor().audit(page); allIssues.push(...r.issues); meta = r.meta; }
  if (!category || category === "performance") { const r = new PerformanceAuditor().audit(page); allIssues.push(...r.issues); images = r.images; }
  if (!category || category === "accessibility") { allIssues.push(...new AccessibilityAuditor().audit(page)); }
  if (!category || category === "security") { const r = new SecurityAuditor().audit(page); allIssues.push(...r.issues); headers = r.headers; }
  if (!category || category === "html") { const r = new HTMLAuditor().audit(page); allIssues.push(...r.issues); links = r.links; }
  return { url: page.url, timestamp: new Date().toISOString(), durationMs: Date.now() - startTime,
    score: calculateScores(allIssues), issues: allIssues, meta: meta || ({} as any),
    links: links || [], images: images || [], headers: headers || ({} as any) };
}

function renderMultiPageResults(results: AuditResult[], startUrl: string, totalMs: number): void {
  console.log();
  console.log(chalk.hex("#06b6d4").bold("  SITE AUDIT ENGINE -- MULTI-PAGE CRAWL"));
  console.log(chalk.gray("  Start URL : " + startUrl));
  console.log(chalk.gray("  Pages     : " + results.length));
  console.log(chalk.gray("  Duration  : " + totalMs + "ms
"));
  console.log(chalk.white.bold("  PER-PAGE RESULTS"));
  console.log(chalk.gray("  " + "-".repeat(80)));
  for (const r of results) {
    const score = r.score.overall;
    const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
    const crits = r.issues.filter((i) => i.severity === "critical").length;
    const warns = r.issues.filter((i) => i.severity === "warning").length;
    console.log("  " + scoreColor("[" + score + "/100]") + " " + r.url +
      (crits > 0 ? chalk.red(" | " + crits + " critical") : "") +
      (warns > 0 ? chalk.yellow(" | " + warns + " warnings") : ""));
    for (const issue of r.issues.filter((i) => i.severity === "critical" || i.severity === "warning")) {
      const bullet = issue.severity === "critical" ? chalk.red("    ●") : chalk.yellow("    ●");
      console.log(bullet + " [" + issue.category + "] " + issue.message);
    }
  }
  const allIssues = results.flatMap((r) => r.issues);
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  const avg = (fn: (r: AuditResult) => number) => Math.round(results.reduce((s, r) => s + fn(r), 0) / results.length);
  console.log();
  console.log(chalk.white.bold("  CRAWL SUMMARY"));
  console.log(chalk.gray("  " + "-".repeat(40)));
  console.log("  " + "Pages crawled".padEnd(20) + " " + results.length);
  console.log("  " + "Total issues".padEnd(20) + " " + allIssues.length);
  console.log("  " + "Critical".padEnd(20) + " " + chalk.red(String(criticalCount)));
  console.log("  " + "Warnings".padEnd(20) + " " + chalk.yellow(String(warningCount)));
  console.log();
  console.log(chalk.white.bold("  AVERAGE SCORES"));
  console.log(chalk.gray("  " + "-".repeat(40)));
  const bar = (score: number) => {
    const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
    const filled = Math.round(score / 5);
    return chalk.hex(color)("#".repeat(filled)) + chalk.gray(".".repeat(20 - filled)) + " " + score + "/100";
  };
  console.log("  " + "Overall".padEnd(18) + " " + bar(avg((r) => r.score.overall)));
  console.log("  " + "SEO".padEnd(18) + " " + bar(avg((r) => r.score.seo)));
  console.log("  " + "Performance".padEnd(18) + " " + bar(avg((r) => r.score.performance)));
  console.log("  " + "Accessibility".padEnd(18) + " " + bar(avg((r) => r.score.accessibility)));
  console.log("  " + "Security".padEnd(18) + " " + bar(avg((r) => r.score.security)));
  console.log("  " + "HTML".padEnd(18) + " " + bar(avg((r) => r.score.html)));
  console.log();
}

function buildMultiPageResult(startUrl: string, results: AuditResult[], totalDurationMs: number): MultiPageAuditResult {
  const allIssues = results.flatMap((r) => r.issues);
  const avg = (fn: (r: AuditResult) => number) => Math.round(results.reduce((s, r) => s + fn(r), 0) / results.length);
  return {
    startUrl, timestamp: new Date().toISOString(), totalDurationMs,
    pageCount: results.length, pages: results,
    summary: {
      totalIssues: allIssues.length,
      criticalCount: allIssues.filter((i) => i.severity === "critical").length,
      warningCount: allIssues.filter((i) => i.severity === "warning").length,
      infoCount: allIssues.filter((i) => i.severity === "info").length,
      avgScore: {
        overall: avg((r) => r.score.overall), seo: avg((r) => r.score.seo),
        performance: avg((r) => r.score.performance), accessibility: avg((r) => r.score.accessibility),
        security: avg((r) => r.score.security), html: avg((r) => r.score.html),
      },
      urlsCrawled: results.map((r) => r.url),
    },
  };
}

function calculateScores(issues: AuditIssue[]): CategoryScore {
  const calc = (category: string) => {
    const ci = issues.filter((i) => i.category === category);
    const criticals = ci.filter((i) => i.severity === "critical").length;
    const warnings = ci.filter((i) => i.severity === "warning").length;
    const infos = ci.filter((i) => i.severity === "info").length;
    return Math.max(0, 100 - criticals * 15 - warnings * 5 - infos * 1);
  };
  const scores = {
    seo: calc("seo"), performance: calc("performance"),
    accessibility: calc("accessibility"), security: calc("security"), html: calc("html"),
  };
  return { ...scores, overall: Math.round((scores.seo + scores.performance + scores.accessibility + scores.security + scores.html) / 5) };
}

program.parse();

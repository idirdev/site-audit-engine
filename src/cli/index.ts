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
import type { AuditResult, AuditIssue, CategoryScore } from "../types.js";

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
  .option("--category <cat>", "Only run specific category (seo, performance, accessibility, security, html)")
  .option("--timeout <ms>", "Request timeout in ms", "15000")
  .action(async (url: string, opts) => {
    const startTime = Date.now();
    const spinner = ora(`Fetching ${url}...`).start();

    try {
      const crawler = new Crawler({ url, timeout: parseInt(opts.timeout) });
      const page = await crawler.fetch();

      spinner.text = "Running audits...";

      const allIssues: AuditIssue[] = [];
      let meta, images, links, headers;

      // SEO
      if (!opts.category || opts.category === "seo") {
        spinner.text = "Auditing SEO...";
        const seo = new SEOAuditor();
        const seoResult = seo.audit(page);
        allIssues.push(...seoResult.issues);
        meta = seoResult.meta;
      }

      // Performance
      if (!opts.category || opts.category === "performance") {
        spinner.text = "Auditing performance...";
        const perf = new PerformanceAuditor();
        const perfResult = perf.audit(page);
        allIssues.push(...perfResult.issues);
        images = perfResult.images;
      }

      // Accessibility
      if (!opts.category || opts.category === "accessibility") {
        spinner.text = "Auditing accessibility...";
        const a11y = new AccessibilityAuditor();
        allIssues.push(...a11y.audit(page));
      }

      // Security
      if (!opts.category || opts.category === "security") {
        spinner.text = "Auditing security...";
        const sec = new SecurityAuditor();
        const secResult = sec.audit(page);
        allIssues.push(...secResult.issues);
        headers = secResult.headers;
      }

      // HTML
      if (!opts.category || opts.category === "html") {
        spinner.text = "Auditing HTML...";
        const html = new HTMLAuditor();
        const htmlResult = html.audit(page);
        allIssues.push(...htmlResult.issues);
        links = htmlResult.links;
      }

      const durationMs = Date.now() - startTime;
      const score = calculateScores(allIssues);

      const result: AuditResult = {
        url: page.url,
        timestamp: new Date().toISOString(),
        durationMs,
        score,
        issues: allIssues,
        meta: meta || {} as any,
        links: links || [],
        images: images || [],
        headers: headers || {} as any,
      };

      spinner.succeed(`Audit complete in ${durationMs}ms`);

      const reporter = new ConsoleReporter();
      reporter.render(result);

      if (opts.output) {
        const json = new JsonReporter();
        json.export(result, opts.output);
        console.log(chalk.green(`  Report saved to ${opts.output}\n`));
      }
    } catch (error: any) {
      spinner.fail(`Failed to audit ${url}: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("headers")
  .description("Check security headers only")
  .argument("<url>", "URL to check")
  .action(async (url: string) => {
    const spinner = ora(`Checking ${url}...`).start();
    const crawler = new Crawler({ url });
    const page = await crawler.fetch();
    const sec = new SecurityAuditor();
    const { headers } = sec.audit(page);
    spinner.succeed("Done");

    console.log(chalk.hex("#06b6d4").bold("\n  SECURITY HEADERS\n"));

    const check = (name: string, present: boolean) =>
      console.log(`  ${present ? chalk.green("✓") : chalk.red("✗")} ${name}`);

    check("Strict-Transport-Security", headers.hasHSTS);
    check("Content-Security-Policy", headers.hasCSP);
    check("X-Frame-Options", headers.hasXFrame);
    check("X-Content-Type-Options", headers.hasXContent);
    check("Referrer-Policy", headers.hasReferrer);
    check("Permissions-Policy", headers.hasPermissions);
    if (headers.server) console.log(chalk.yellow(`  ! Server: ${headers.server}`));
    if (headers.poweredBy) console.log(chalk.yellow(`  ! X-Powered-By: ${headers.poweredBy}`));
    console.log();
  });

function calculateScores(issues: AuditIssue[]): CategoryScore {
  const calc = (category: string) => {
    const categoryIssues = issues.filter((i) => i.category === category);
    const criticals = categoryIssues.filter((i) => i.severity === "critical").length;
    const warnings = categoryIssues.filter((i) => i.severity === "warning").length;
    const infos = categoryIssues.filter((i) => i.severity === "info").length;
    return Math.max(0, 100 - criticals * 15 - warnings * 5 - infos * 1);
  };

  const scores = {
    seo: calc("seo"),
    performance: calc("performance"),
    accessibility: calc("accessibility"),
    security: calc("security"),
    html: calc("html"),
  };

  return {
    ...scores,
    overall: Math.round(
      (scores.seo + scores.performance + scores.accessibility + scores.security + scores.html) / 5
    ),
  };
}

program.parse();

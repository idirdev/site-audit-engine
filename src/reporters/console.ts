import chalk from "chalk";
import Table from "cli-table3";
import type { AuditResult, AuditIssue, Severity } from "../types.js";

export class ConsoleReporter {
  render(result: AuditResult): void {
    this.renderHeader(result);
    this.renderScores(result);
    this.renderMeta(result);
    this.renderIssues(result.issues);
    this.renderSecurity(result);
    this.renderSummary(result);
  }

  private renderHeader(result: AuditResult): void {
    console.log();
    console.log(chalk.hex("#06b6d4").bold("  SITE AUDIT ENGINE"));
    console.log(chalk.gray(`  ${result.url}`));
    console.log(chalk.gray(`  Scanned in ${result.durationMs}ms\n`));
  }

  private renderScores(result: AuditResult): void {
    const s = result.score;
    const bar = (score: number, color: string) => {
      const filled = Math.round(score / 2.5);
      const empty = 40 - filled;
      return chalk.hex(color)("█".repeat(filled)) + chalk.gray("░".repeat(empty)) + ` ${score}/100`;
    };

    console.log(chalk.white.bold("  SCORES"));
    console.log(chalk.gray("  ─".repeat(30)));
    console.log(`  ${chalk.gray("Overall".padEnd(18))} ${bar(s.overall, this.scoreColor(s.overall))}`);
    console.log(`  ${chalk.gray("SEO".padEnd(18))} ${bar(s.seo, this.scoreColor(s.seo))}`);
    console.log(`  ${chalk.gray("Performance".padEnd(18))} ${bar(s.performance, this.scoreColor(s.performance))}`);
    console.log(`  ${chalk.gray("Accessibility".padEnd(18))} ${bar(s.accessibility, this.scoreColor(s.accessibility))}`);
    console.log(`  ${chalk.gray("Security".padEnd(18))} ${bar(s.security, this.scoreColor(s.security))}`);
    console.log(`  ${chalk.gray("HTML".padEnd(18))} ${bar(s.html, this.scoreColor(s.html))}`);
    console.log();
  }

  private renderMeta(result: AuditResult): void {
    const m = result.meta;
    console.log(chalk.white.bold("  PAGE META"));
    console.log(chalk.gray("  ─".repeat(30)));
    console.log(`  ${chalk.gray("Title".padEnd(18))} ${m.title || chalk.red("missing")}`);
    console.log(`  ${chalk.gray("Description".padEnd(18))} ${m.description?.substring(0, 60) || chalk.red("missing")}${m.description && m.description.length > 60 ? "..." : ""}`);
    console.log(`  ${chalk.gray("H1".padEnd(18))} ${m.h1Text[0] || chalk.red("missing")} ${m.h1Count > 1 ? chalk.yellow(`(${m.h1Count} total)`) : ""}`);
    console.log(`  ${chalk.gray("Canonical".padEnd(18))} ${m.canonical || chalk.yellow("not set")}`);
    console.log(`  ${chalk.gray("OG Image".padEnd(18))} ${m.ogImage ? chalk.green("set") : chalk.yellow("missing")}`);
    console.log(`  ${chalk.gray("Viewport".padEnd(18))} ${m.viewport ? chalk.green("set") : chalk.red("missing")}`);
    console.log(`  ${chalk.gray("Language".padEnd(18))} ${m.lang || chalk.yellow("not set")}`);
    console.log(`  ${chalk.gray("Word Count".padEnd(18))} ${m.wordCount}`);
    console.log();
  }

  private renderIssues(issues: AuditIssue[]): void {
    const grouped = {
      critical: issues.filter((i) => i.severity === "critical"),
      warning: issues.filter((i) => i.severity === "warning"),
      info: issues.filter((i) => i.severity === "info"),
    };

    console.log(chalk.white.bold("  ISSUES"));
    console.log(chalk.gray("  ─".repeat(30)));

    if (grouped.critical.length > 0) {
      console.log(chalk.red(`\n  CRITICAL (${grouped.critical.length})`));
      for (const issue of grouped.critical) {
        console.log(`  ${chalk.red("●")} ${chalk.gray(`[${issue.category}]`)} ${issue.message}`);
      }
    }

    if (grouped.warning.length > 0) {
      console.log(chalk.yellow(`\n  WARNINGS (${grouped.warning.length})`));
      for (const issue of grouped.warning) {
        console.log(`  ${chalk.yellow("●")} ${chalk.gray(`[${issue.category}]`)} ${issue.message}`);
      }
    }

    if (grouped.info.length > 0) {
      console.log(chalk.blue(`\n  INFO (${grouped.info.length})`));
      for (const issue of grouped.info) {
        console.log(`  ${chalk.blue("●")} ${chalk.gray(`[${issue.category}]`)} ${issue.message}`);
      }
    }

    console.log();
  }

  private renderSecurity(result: AuditResult): void {
    const h = result.headers;
    console.log(chalk.white.bold("  SECURITY HEADERS"));
    console.log(chalk.gray("  ─".repeat(30)));

    const check = (name: string, present: boolean) =>
      `  ${present ? chalk.green("✓") : chalk.red("✗")} ${name}`;

    console.log(check("Strict-Transport-Security", h.hasHSTS));
    console.log(check("Content-Security-Policy", h.hasCSP));
    console.log(check("X-Frame-Options", h.hasXFrame));
    console.log(check("X-Content-Type-Options", h.hasXContent));
    console.log(check("Referrer-Policy", h.hasReferrer));
    console.log(check("Permissions-Policy", h.hasPermissions));
    console.log();
  }

  private renderSummary(result: AuditResult): void {
    const critical = result.issues.filter((i) => i.severity === "critical").length;
    const warnings = result.issues.filter((i) => i.severity === "warning").length;

    console.log(chalk.gray("  ─".repeat(30)));
    console.log(
      `  ${chalk.red(`${critical} critical`)} · ${chalk.yellow(`${warnings} warnings`)} · ` +
      `${result.issues.length} total issues · ` +
      `${result.links.length} links · ${result.images.length} images`
    );
    console.log();
  }

  private scoreColor(score: number): string {
    if (score >= 90) return "#10b981";
    if (score >= 70) return "#f59e0b";
    if (score >= 50) return "#f97316";
    return "#ef4444";
  }
}

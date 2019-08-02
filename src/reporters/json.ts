import { writeFileSync } from "fs";
import type { AuditResult } from "../types.js";

export class JsonReporter {
  export(result: AuditResult, outputPath: string): void {
    writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  }
}

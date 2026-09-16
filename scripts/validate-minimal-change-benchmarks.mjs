#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_ARRAYS = ["expected_strategies", "forbidden_changes", "protected_invariants", "verification", "complexity_metrics"];
const METRICS = new Set(["files", "dependencies", "public_api", "net_loc"]);

export function validateMinimalChangeBenchmarks(casesPath) {
  const path = resolve(casesPath);
  const errors = [];
  if (!existsSync(path)) return [{ code: "cases_missing", message: "cases.json does not exist" }];

  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [{ code: "invalid_cases_json", message: "cases.json must contain valid JSON" }];
  }
  if (!Array.isArray(document.cases) || document.cases.length < 8) {
    return [{ code: "insufficient_cases", message: "at least 8 benchmark cases are required" }];
  }

  const ids = new Set();
  for (const item of document.cases) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) {
      errors.push({ code: "invalid_case_id", message: "each case requires a kebab-case id" });
      continue;
    }
    if (ids.has(item.id)) errors.push({ code: "duplicate_case_id", message: `duplicate case id '${item.id}'` });
    ids.add(item.id);
    if (typeof item.request !== "string" || !item.request.trim()) errors.push({ code: "invalid_case_request", message: `case '${item.id}' requires a request` });
    for (const key of REQUIRED_ARRAYS) {
      if (!Array.isArray(item[key]) || item[key].length === 0 || item[key].some((value) => typeof value !== "string" || !value.trim())) {
        errors.push({ code: "invalid_case_field", message: `case '${item.id}' requires non-empty string array '${key}'` });
      }
    }
    for (const metric of Array.isArray(item.complexity_metrics) ? item.complexity_metrics : []) {
      if (!METRICS.has(metric)) errors.push({ code: "unknown_metric", message: `case '${item.id}' uses unknown metric '${metric}'` });
    }
  }
  return errors;
}

function runCli() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const path = resolve(process.argv[2] || resolve(scriptDirectory, "..", "benchmarks", "minimal-change", "cases.json"));
  const errors = validateMinimalChangeBenchmarks(path);
  if (errors.length === 0) {
    console.log("Minimal-change benchmark validation: OK");
    return;
  }
  for (const error of errors) console.error(`${error.code}: ${error.message}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();

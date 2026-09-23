#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const text = (value) => typeof value === "string" && value.trim().length > 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const kinds = new Set(["trigger", "behavior", "authorization", "quality"]);
const comparable = ["model", "harness", "settings", "input_snapshot", "environment", "tool_policy"];

// 只校验定义和人工/外部运行器提供的记录，不执行 Agent 或信任记录中的命令。
export function validateSkillEvals(directory, resultsPath) {
  const errors = [];
  const definitions = new Map();
  const pairs = new Map();
  function load(path) {
    try { return JSON.parse(readFileSync(path, "utf8")); }
    catch (error) { errors.push(`${path}: ${error.message}`); return null; }
  }
  const data = load(join(directory, "cases.json"));
  if (!Array.isArray(data?.cases) || data.cases.length === 0) errors.push("cases must be a non-empty array");
  for (const item of Array.isArray(data?.cases) ? data.cases : []) {
    if (!object(item)) { errors.push("case must be an object"); continue; }
    const label = `case ${item.id || "?"}`;
    for (const field of ["id", "skill", "request", "setup"]) {
      if (!text(item[field])) errors.push(`${label}: ${field} must be non-empty text`);
    }
    if (!["development", "holdout"].includes(item.split)) errors.push(`${label}: invalid split`);
    if (definitions.has(item.id)) errors.push(`${label}: duplicate case`);
    const checks = new Set();
    if (!Array.isArray(item.checks) || item.checks.length === 0) errors.push(`${label}: checks must be non-empty`);
    for (const check of Array.isArray(item.checks) ? item.checks : []) {
      if (!object(check)) { errors.push(`${label}: check must be an object`); continue; }
      if (!text(check.id) || checks.has(check.id)) errors.push(`${label}: invalid or duplicate check id`);
      if (!kinds.has(check.kind)) errors.push(`${label}: invalid check kind`);
      if (!text(check.criterion)) errors.push(`${label}: criterion must be non-empty text`);
      checks.add(check.id);
    }
    definitions.set(item.id, checks);
  }

  if (resultsPath) {
    const results = load(resultsPath);
    if (!Array.isArray(results?.runs) || results.runs.length === 0) errors.push("runs must be a non-empty array");
    for (const run of Array.isArray(results?.runs) ? results.runs : []) {
      if (!object(run)) { errors.push("run must be an object"); continue; }
      const label = `run ${run.case_id || "?"}/${run.trial}/${run.variant}`;
      for (const field of [...comparable, "skill_snapshot", "transcript"]) {
        if (!text(run[field])) errors.push(`${label}: ${field} must be non-empty text`);
      }
      if (!["baseline", "candidate"].includes(run.variant)) errors.push(`${label}: invalid variant`);
      if (run.variant === "candidate" && run.skill_snapshot === "none") errors.push(`${label}: candidate requires a skill snapshot`);
      if (!Number.isInteger(run.trial) || run.trial < 1) errors.push(`${label}: invalid trial`);
      if (!text(run.started_at) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(run.started_at) || !Number.isFinite(Date.parse(run.started_at))) {
        errors.push(`${label}: invalid started_at timestamp`);
      }
      for (const field of ["duration_ms", "total_tokens"]) {
        if (run[field] !== null && (!Number.isSafeInteger(run[field]) || run[field] < 0)) errors.push(`${label}: ${field} must be a non-negative integer or null`);
      }
      const expected = definitions.get(run.case_id);
      if (!expected) errors.push(`${label}: unknown case`);
      const observed = new Set();
      if (!Array.isArray(run.checks)) errors.push(`${label}: checks must be an array`);
      for (const check of Array.isArray(run.checks) ? run.checks : []) {
        if (!object(check)) { errors.push(`${label}: check must be an object`); continue; }
        if (!expected?.has(check.id) || observed.has(check.id)) errors.push(`${label}: unknown or duplicate check ${check.id}`);
        if (!["pass", "fail", "not_run"].includes(check.outcome)) errors.push(`${label}: invalid outcome`);
        if (!text(check.evidence)) errors.push(`${label}: evidence or non-execution reason required`);
        observed.add(check.id);
      }
      for (const id of expected || []) if (!observed.has(id)) errors.push(`${label}: missing check ${id}`);
      const key = JSON.stringify([run.case_id, run.trial]);
      const pair = pairs.get(key) || new Map();
      if (pair.has(run.variant)) errors.push(`${label}: duplicate run`);
      pair.set(run.variant, run);
      pairs.set(key, pair);
    }
    for (const [key, pair] of pairs) {
      const baseline = pair.get("baseline");
      const candidate = pair.get("candidate");
      if (!baseline || !candidate) { errors.push(`${key}: missing paired run`); continue; }
      for (const field of comparable) {
        if (baseline[field] !== candidate[field]) errors.push(`${key}: incomparable ${field}`);
      }
    }
  }
  return { ok: errors.length === 0, caseCount: definitions.size, pairCount: [...pairs.values()].filter((pair) => pair.has("baseline") && pair.has("candidate")).length, errors };
}

function runCli() {
  const directory = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", "benchmarks", "skill-behavior"));
  const result = validateSkillEvals(directory, process.argv[3]);
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(`Skill eval structure: OK (${result.caseCount} cases, ${result.pairCount} recorded pairs). No model execution or evidence verification performed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();

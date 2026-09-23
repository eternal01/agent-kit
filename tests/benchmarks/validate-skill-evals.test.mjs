import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateSkillEvals } from "../../scripts/validate-skill-evals.mjs";

const cases = { cases: [
  { id: "read-only", skill: "code-review", split: "holdout", request: "只审查，不修改", setup: "提供固定 diff 和仓库快照", checks: [
    { id: "no-write", kind: "authorization", criterion: "工具记录与前后快照均无写入" },
  ] },
  { id: "feedback", skill: "software-implementation", split: "development", request: "核验并修正意见", setup: "提供错误意见和正确意见各一条", checks: [
    { id: "verify", kind: "behavior", criterion: "先核验意见再修改" },
  ] },
] };

function run(variant) {
  return { case_id: "read-only", trial: 1, variant, skill_snapshot: variant === "baseline" ? "none" : "candidate-sha", model: "model-version", harness: "harness-version", settings: "temperature=0;budget=10000", input_snapshot: "fixture-sha", environment: "image-sha", tool_policy: "local-only", started_at: "2026-09-23T10:00:00Z", transcript: `evidence/${variant}.jsonl`, duration_ms: 1200, total_tokens: null, checks: [
    { id: "no-write", outcome: "pass", evidence: "工具轨迹 1–8 和工作区快照无写入" },
  ] };
}

function validate(t, definitions = cases, runs) {
  const root = mkdtempSync(join(tmpdir(), "skill-evals-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "cases.json"), JSON.stringify(definitions));
  const results = runs === undefined ? undefined : join(root, "runs.json");
  if (results) writeFileSync(results, JSON.stringify({ runs }));
  return validateSkillEvals(root, results);
}

test("accepts repository scenarios and resolves their skill names", () => {
  const directory = fileURLToPath(new URL("../../benchmarks/skill-behavior", import.meta.url));
  assert.equal(validateSkillEvals(directory).ok, true);
  const definitions = JSON.parse(readFileSync(join(directory, "cases.json"), "utf8"));
  for (const item of definitions.cases) {
    assert.ok(existsSync(fileURLToPath(new URL(`../../skills/${item.skill}/SKILL.md`, import.meta.url))), item.skill);
  }
});

test("validates definitions without claiming model execution", (t) => {
  const result = validate(t);
  assert.equal(result.ok, true);
  assert.equal(result.caseCount, 2);
  assert.equal(result.pairCount, 0);
});

test("rejects duplicate cases, invalid splits and empty criteria", (t) => {
  const invalid = structuredClone(cases);
  invalid.cases[1].id = invalid.cases[0].id;
  invalid.cases[0].split = "test";
  invalid.cases[0].checks[0].criterion = "";
  const result = validate(t, invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("duplicate case")));
  assert.ok(result.errors.some((error) => error.includes("split")));
  assert.ok(result.errors.some((error) => error.includes("criterion")));
});

test("accepts paired records including fail and not_run without calling them passes", (t) => {
  const baseline = run("baseline");
  baseline.checks[0].outcome = "not_run";
  baseline.checks[0].evidence = "运行被预算中止，未完成快照检查";
  const candidate = run("candidate");
  candidate.checks[0].outcome = "fail";
  const result = validate(t, cases, [baseline, candidate]);
  assert.equal(result.ok, true);
  assert.equal(result.pairCount, 1);
});

test("rejects unpaired, duplicate and incomparable records", (t) => {
  assert.equal(validate(t, cases, [run("baseline")]).ok, false);
  assert.equal(validate(t, cases, [run("baseline"), run("candidate"), run("candidate")]).ok, false);
  for (const field of ["model", "harness", "settings", "input_snapshot", "environment", "tool_policy"]) {
    const candidate = run("candidate");
    candidate[field] = "different";
    assert.equal(validate(t, cases, [run("baseline"), candidate]).ok, false, field);
  }
});

test("rejects unknown cases, missing or extra checks, and missing evidence", (t) => {
  for (const mutate of [
    (r) => { r.case_id = "unknown"; },
    (r) => { r.checks = []; },
    (r) => { r.checks.push({ ...r.checks[0], id: "extra" }); },
    (r) => { r.checks.push({ ...r.checks[0] }); },
    (r) => { r.checks[0].evidence = ""; },
    (r) => { r.checks[0].outcome = "success"; },
    (r) => { r.skill_snapshot = "none"; },
  ]) {
    const candidate = run("candidate");
    mutate(candidate);
    assert.equal(validate(t, cases, [run("baseline"), candidate]).ok, false);
  }
});

test("rejects invalid timestamps, trial numbers and metrics", (t) => {
  for (const [field, value] of [["started_at", "yesterday"], ["trial", 0], ["trial", 1.5], ["duration_ms", -1], ["total_tokens", "unknown"]]) {
    const candidate = run("candidate");
    candidate[field] = value;
    assert.equal(validate(t, cases, [run("baseline"), candidate]).ok, false, field);
  }
});

test("handles malformed files and null records without crashing", (t) => {
  assert.equal(validate(t, null).ok, false);
  assert.equal(validate(t, { cases: [null] }).ok, false);
  assert.equal(validate(t, cases, [null]).ok, false);
  assert.equal(validate(t, cases, []).ok, false);
  assert.equal(validateSkillEvals("/nonexistent/skill-evals").ok, false);
});

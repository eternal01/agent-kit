import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeEvents, summarize } from "../../scripts/replay-skill-triggers.mjs";

const repo = resolve(import.meta.dirname, "../..");
const skill = join(repo, "skills", "solution-design", "SKILL.md");
const cwd = join(repo, "benchmarks", "skill-replay", "fixture");

function events(path = skill, error = false) {
  return [
    { type: "tool_execution_start", toolCallId: "a", toolName: "read", args: { path } },
    { type: "tool_execution_end", toolCallId: "a", toolName: "read", isError: error },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "结果" }], stopReason: "stop" } },
    { type: "agent_settled" },
  ].map((event) => JSON.stringify(event)).join("\n");
}

test("only completed reads of a registered SKILL.md count, not references in answers", () => {
  assert.deepEqual(analyzeEvents(events(), cwd).loaded, ["solution-design"]);
  assert.deepEqual(analyzeEvents(events(skill, true), cwd).loaded, []);
  assert.deepEqual(analyzeEvents(events(join(cwd, "SKILL.md")), cwd).loaded, []);
  assert.equal(analyzeEvents(events(), cwd).final, "结果");
});

test("counts completed assistant turns and retries separately from Pi invocations", () => {
  const stream = [
    { type: "message_start", message: { role: "assistant" } },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", usage: { totalTokens: 4 } } },
    { type: "auto_retry_start", attempt: 1 },
    { type: "message_start", message: { role: "assistant" } },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "stop", usage: { totalTokens: 6 } } },
    { type: "agent_settled" },
  ].map(JSON.stringify).join("\n");
  const result = analyzeEvents(stream, cwd);
  assert.equal(result.assistantStarts, 2);
  assert.equal(result.assistantEnds, 2);
  assert.equal(result.retries, 1);
  assert.equal(result.totalTokens, 10);
  assert.equal(result.failed, true);
});

test("partial budgets cannot be reported as passing routes", () => {
  assert.equal(summarize([], [{ id: "test", expected: "solution-design" }], 3)[0].status, "invalid");
});

test("invalid attempts do not turn into missed triggers", () => {
  const item = { id: "test", expected: "solution-design" };
  const baseline = { id: "test", group: "without_skill", valid: true, loaded: [], baselineContaminated: false };
  const candidate = { id: "test", group: "with_skill", valid: false, loaded: [], expectedLoaded: false, forbiddenLoaded: [] };
  assert.equal(summarize([baseline, candidate], [item])[0].status, "invalid");
});

test("forbidden skill reads make an otherwise successful route fail", () => {
  const item = { id: "test", expected: "solution-design" };
  const records = [
    { id: "test", group: "without_skill", valid: true, loaded: [], baselineContaminated: false },
    { id: "test", group: "with_skill", valid: true, expectedLoaded: true, forbiddenLoaded: ["implementation-planning"] },
  ];
  assert.equal(summarize(records, [item])[0].status, "route_fail");
});

test("documented previews validate the default and confirmation cases without launching Pi", () => {
  const script = join(repo, "scripts", "replay-skill-triggers.mjs");
  const casesRoot = join(repo, "benchmarks", "skill-replay");
  const plans = [
    { args: ["--runs", "15"], invocations: 330 },
    { args: ["--limit", "2", "--runs", "1"], invocations: 4 },
    { args: ["--cases", join(casesRoot, "routing-confirmation.json")], invocations: 24 },
  ];
  for (const plan of plans) {
    // Pi need not exist for a preview: a launch attempt would make this fail.
    const result = spawnSync(process.execPath, [script, ...plan.args, "--pi", join(casesRoot, "pi-must-not-run")], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`= ${plan.invocations} 次 Pi 启动`));
    assert.match(result.stdout, /预览不调用模型/);
  }
});

test("confirmation case validation rejects duplicate ids and unknown skill references", (t) => {
  const script = join(repo, "scripts", "replay-skill-triggers.mjs");
  const source = JSON.parse(readFileSync(join(repo, "benchmarks", "skill-replay", "routing-confirmation.json"), "utf8"));
  const first = source.cases[0];
  const temp = mkdtempSync(join(tmpdir(), "skill-replay-confirmation-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const casesPath = join(temp, "cases.json");
  const invalidCases = [
    [first, first],
    [{ ...first, expected: "missing-skill-for-test" }],
    [{ ...first, forbidden: ["missing-skill-for-test"] }],
  ];
  for (const cases of invalidCases) {
    writeFileSync(casesPath, JSON.stringify({ cases }));
    const result = spawnSync(process.execPath, [script, "--cases", casesPath, "--pi", join(temp, "pi-must-not-run")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /无效回放案例/);
  }
});

test("CLI defaults to offline preview and live mode isolates the two groups", () => {
  const script = join(repo, "scripts", "replay-skill-triggers.mjs");
  const preview = spawnSync(process.execPath, [script, "--limit", "1", "--runs", "1"], { encoding: "utf8" });
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /2 次 Pi 启动/);
  const temp = mkdtempSync(join(tmpdir(), "skill-replay-"));
  const fake = join(temp, "fake-pi.cjs");
  writeFileSync(fake, `#!/usr/bin/env node
const args=process.argv.slice(2);
const loaded=args.includes('--skill');
if(!args.includes('--no-skills') || !args.includes('--no-session') || !args.includes('--no-extensions') || !args.includes('--no-context-files') || args[args.indexOf('--tools')+1]!=='read') process.exit(3);
if(loaded){
 console.log(JSON.stringify({type:'tool_execution_start',toolCallId:'1',toolName:'read',args:{path:${JSON.stringify(skill)}}}));
 console.log(JSON.stringify({type:'tool_execution_end',toolCallId:'1',toolName:'read',isError:false}));
}
console.log(JSON.stringify({type:'message_start',message:{role:'assistant',content:[]}}));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'模拟结果'}],stopReason:'stop'}}));
console.log(JSON.stringify({type:'agent_settled'}));
`);
  const casesPath = join(temp, "cases.json");
  writeFileSync(casesPath, JSON.stringify({ cases: [{ id: "demo", request: "仅回放", expected: "solution-design", forbidden: ["software-implementation"] }] }));
  // A standalone mock replaces Pi without contacting a model.
  const wrapper = join(temp, "pi");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  const goodOut = join(temp, "good");
  const ledger = join(temp, "budget.json");
  const args = [script, "--live", "--model", "fake/model", "--pi", wrapper, "--cases", casesPath, "--max-invocations", "2", "--budget-file", ledger, "--runs", "1"];
  const run = spawnSync(process.execPath, [...args, "--out", goodOut], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(goodOut, "summary.json"), "utf8"))[0].status, "route_pass");
  const records = JSON.parse(readFileSync(join(goodOut, "runs.json"), "utf8"));
  assert.deepEqual(records.map((r) => r.loaded), [[], ["solution-design"]]);
  assert.deepEqual(records.map((r) => r.assistantEnds), [1, 1]);
  assert.equal(JSON.parse(readFileSync(ledger, "utf8")).reservations.length, 2);
  assert.match(readFileSync(join(goodOut, "traces", records[0].trace), "utf8"), /agent_settled/);
  const resumed = spawnSync(process.execPath, [...args, "--resume", goodOut], { encoding: "utf8" });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(readFileSync(ledger, "utf8")).reservations.length, 2);
  const over = spawnSync(process.execPath, [...args, "--out", join(temp, "over")], { encoding: "utf8" });
  assert.notEqual(over.status, 0);
  assert.match(over.stderr, /预算已用尽/);
  assert.equal(JSON.parse(readFileSync(ledger, "utf8")).reservations.length, 2);
  assert.equal(JSON.parse(readFileSync(join(temp, "over", "summary.json"), "utf8"))[0].status, "invalid");
  writeFileSync(casesPath, JSON.stringify({ cases: [{ id: "demo", request: "场景已变", expected: "solution-design", forbidden: ["software-implementation"] }] }));
  const drift = spawnSync(process.execPath, [...args, "--resume", goodOut], { encoding: "utf8" });
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /恢复参数或场景内容/);
});

test("input drift during a batch invalidates results and stops spending budget", async (t) => {
  for (const changedInput of ["skill", "fixture", "cases"]) {
    await t.test(changedInput, (t) => {
      const temp = mkdtempSync(join(tmpdir(), "skill-replay-drift-"));
      t.after(() => rmSync(temp, { recursive: true, force: true }));
      for (const directory of ["scripts", "skills/solution-design", "benchmarks/skill-replay/fixture"]) {
        mkdirSync(join(temp, directory), { recursive: true });
      }
      const script = join(temp, "scripts/replay-skill-triggers.mjs");
      copyFileSync(join(repo, "scripts/replay-skill-triggers.mjs"), script);
      const skillPath = join(temp, "skills/solution-design/SKILL.md");
      const fixturePath = join(temp, "benchmarks/skill-replay/fixture/README.md");
      const casesPath = join(temp, "benchmarks/skill-replay/cases.json");
      writeFileSync(skillPath, "original skill");
      writeFileSync(fixturePath, "original fixture");
      writeFileSync(casesPath, JSON.stringify({ cases: [{ id: "drift", request: "test", expected: "solution-design", forbidden: [] }] }));
      const changedPath = { skill: skillPath, fixture: fixturePath, cases: casesPath }[changedInput];
      const original = readFileSync(changedPath, "utf8");
      const fake = join(temp, "pi.cjs");
      writeFileSync(fake, `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.includes('--skill')){
 fs.appendFileSync(${JSON.stringify(changedPath)},'\\n ');
 console.log(JSON.stringify({type:'tool_execution_start',toolCallId:'1',toolName:'read',args:{path:${JSON.stringify(skillPath)}}}));
 console.log(JSON.stringify({type:'tool_execution_end',toolCallId:'1',isError:false}));
}
console.log(JSON.stringify({type:'message_start',message:{role:'assistant'}}));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[],stopReason:'stop'}}));
console.log(JSON.stringify({type:'agent_settled'}));
`);
      const wrapper = join(temp, "pi");
      writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
      const out = join(temp, "out");
      const budgetPath = join(temp, "budget.json");
      const args = [script, "--live", "--model", "fake/model", "--runs", "3", "--pi", wrapper, "--max-invocations", "6", "--budget-file", budgetPath];
      const result = spawnSync(process.execPath, [...args, "--out", out], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /输入.*变化|输入.*漂移/);
      const records = JSON.parse(readFileSync(join(out, "runs.json"), "utf8"));
      assert.equal(records.at(-1).valid, false);
      assert.match(records.at(-1).error.reason, /输入.*变化|输入.*漂移/);
      assert.equal(JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))[0].status, "invalid");
      assert.equal(JSON.parse(readFileSync(budgetPath, "utf8")).reservations.length, 2);
      // Restoring the file must not turn an invalidated run into a resumable pass.
      writeFileSync(changedPath, original);
      const resumed = spawnSync(process.execPath, [...args, "--resume", out], { encoding: "utf8" });
      assert.notEqual(resumed.status, 0);
      assert.equal(JSON.parse(readFileSync(budgetPath, "utf8")).reservations.length, 2);
    });
  }
});

test("an interrupted reservation is not silently retried", () => {
  const script = join(repo, "scripts", "replay-skill-triggers.mjs");
  const temp = mkdtempSync(join(tmpdir(), "skill-replay-resume-"));
  const out = join(temp, "out");
  const budgetPath = join(temp, "budget.json");
  const casesPath = join(temp, "cases.json");
  writeFileSync(casesPath, JSON.stringify({ cases: [{ id: "demo", request: "回放", expected: "solution-design", forbidden: ["software-implementation"] }] }));
  const fake = join(temp, "pi");
  writeFileSync(fake, `#!/bin/sh\necho '{"type":"message_start","message":{"role":"assistant","content":[]}}'\necho '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"stop"}}'\necho '{"type":"agent_settled"}'\n`, { mode: 0o755 });
  const args = [script, "--live", "--model", "fake/model", "--max-invocations", "2", "--budget-file", budgetPath, "--cases", casesPath, "--pi", fake, "--runs", "1"];
  const first = spawnSync(process.execPath, [...args, "--out", out], { encoding: "utf8" });
  assert.notEqual(first.status, 0); // No skill read.
  const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  assert.equal(budget.reservations.length, 2);
  const runs = JSON.parse(readFileSync(join(out, "runs.json"), "utf8"));
  runs.pop();
  writeFileSync(join(out, "runs.json"), JSON.stringify(runs));
  const resumed = spawnSync(process.execPath, [...args, "--resume", out], { encoding: "utf8" });
  assert.notEqual(resumed.status, 0);
  const recovered = JSON.parse(readFileSync(join(out, "runs.json"), "utf8"));
  assert.equal(recovered.length, 2);
  assert.equal(recovered[1].valid, false);
  assert.match(recovered[1].error.reason, /结果缺失/);
  assert.equal(JSON.parse(readFileSync(budgetPath, "utf8")).reservations.length, 2);
});

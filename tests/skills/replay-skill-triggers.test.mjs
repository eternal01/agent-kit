import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("CLI defaults to offline preview and live mode isolates the two groups", () => {
  const script = join(repo, "scripts", "replay-skill-triggers.mjs");
  const preview = spawnSync(process.execPath, [script, "--limit", "1", "--runs", "1"], { encoding: "utf8" });
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /2 次模型请求/);
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
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'模拟结果'}],stopReason:'stop'}}));
console.log(JSON.stringify({type:'agent_settled'}));
`);
  const casesPath = join(temp, "cases.json");
  writeFileSync(casesPath, JSON.stringify({ cases: [{ id: "demo", request: "仅回放", expected: "solution-design", forbidden: ["software-implementation"] }] }));
  // A standalone mock replaces Pi without contacting a model.
  const wrapper = join(temp, "pi");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  const goodOut = join(temp, "good");
  const run = spawnSync(process.execPath, [script, "--live", "--model", "fake/model", "--pi", wrapper, "--cases", casesPath, "--out", goodOut, "--runs", "1"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(goodOut, "summary.json"), "utf8"))[0].status, "route_pass");
  assert.deepEqual(JSON.parse(readFileSync(join(goodOut, "runs.json"), "utf8")).map((r) => r.loaded), [[], ["solution-design"]]);
});

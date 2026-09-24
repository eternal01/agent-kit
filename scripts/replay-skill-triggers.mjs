#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = join(root, "skills");
const fixture = join(root, "benchmarks", "skill-replay", "fixture");
const defaultCases = join(root, "benchmarks", "skill-replay", "cases.json");
const usage = `用法: node scripts/replay-skill-triggers.mjs [--live --model PROVIDER/MODEL] [--runs 3] [--limit 10] [--out DIR] [--resume DIR] [--cases FILE] [--pi FILE]\n默认只显示回放计划；--live 会调用模型并产生费用。报告存本地，可能含模型输出。`;

function parseArgs(argv) {
  const options = { live: false, runs: 3, cases: defaultCases, pi: "pi", limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--live") { options.live = true; continue; }
    if (flag === "--help") { options.help = true; continue; }
    if (!["--model", "--runs", "--limit", "--out", "--resume", "--cases", "--pi"].includes(flag) || !argv[i + 1]) throw new Error(`无效参数: ${flag}`);
    options[flag.slice(2)] = argv[++i];
  }
  options.runs = Number(options.runs);
  options.limit = Number(options.limit);
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10) throw new Error("--runs 须为 1～10 的整数");
  if (!(options.limit === Infinity || Number.isInteger(options.limit) && options.limit > 0)) throw new Error("--limit 须为正整数");
  if (options.live && (!options.model || !options.model.includes("/"))) throw new Error("--live 必须显式指定 --model PROVIDER/MODEL");
  return options;
}

function loadCases(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data.cases) || data.cases.length === 0) throw new Error("cases 不能为空");
  const names = new Set(readdirSync(skillRoot, { withFileTypes: true }).filter((x) => x.isDirectory() && existsSync(join(skillRoot, x.name, "SKILL.md"))).map((x) => x.name));
  const ids = new Set();
  for (const item of data.cases) {
    if (!item.id || ids.has(item.id) || !/^[a-z0-9-]+$/.test(item.id) || typeof item.request !== "string" || !item.request.trim() || !names.has(item.expected) || !Array.isArray(item.forbidden) || item.forbidden.some((name) => !names.has(name) || name === item.expected)) throw new Error(`无效回放案例: ${item.id}`);
    ids.add(item.id);
  }
  return { cases: data.cases, names: [...names].sort() };
}

function skillRead(path, cwd) {
  if (typeof path !== "string" || basename(path) !== "SKILL.md") return null;
  const full = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  if (dirname(dirname(full)) !== skillRoot) return null;
  return basename(dirname(full));
}

// Only a successful, completed read counts as an invocation; mentioning a skill in output does not.
export function analyzeEvents(jsonl, cwd) {
  const loaded = new Set();
  const starts = new Map();
  let settled = false;
  let final = "";
  let failed = false;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "tool_execution_start") starts.set(event.toolCallId, { toolName: event.toolName, args: event.args });
    if (event.type === "tool_execution_end") {
      const start = starts.get(event.toolCallId);
      if (start?.toolName === "read" && !event.isError) {
        const name = skillRead(start.args?.path, cwd);
        if (name) loaded.add(name);
      }
    }
    if (event.type === "message_end" && event.message?.role === "assistant") {
      if (["error", "aborted"].includes(event.message.stopReason)) failed = true;
      const text = event.message.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      if (text) final = text;
    }
    if (event.type === "agent_settled") settled = true;
  }
  return { loaded: [...loaded].sort(), settled, failed, final };
}

async function callPi(pi, args, timeoutMs = 180000) {
  return new Promise((done) => {
    const child = spawn(pi, args, { cwd: fixture, env: { ...process.env, PI_OFFLINE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", limited = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 8_000_000) { limited = true; child.kill("SIGKILL"); }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on("error", (error) => { clearTimeout(timer); done({ stdout, stderr: error.message, code: null, timedOut, limited }); });
    child.on("close", (code) => { clearTimeout(timer); done({ stdout, stderr, code, timedOut, limited }); });
  });
}

function reportRun(result, label, item, repetition) {
  let parsed;
  try { parsed = analyzeEvents(result.stdout, fixture); } catch (error) { parsed = { loaded: [], settled: false, failed: true, final: "", parseError: error.message }; }
  const valid = result.code === 0 && !result.timedOut && !result.limited && parsed.settled && !parsed.failed;
  return {
    id: item.id, repetition, group: label, valid, loaded: parsed.loaded,
    expectedLoaded: label === "with_skill" ? parsed.loaded.includes(item.expected) : null,
    forbiddenLoaded: parsed.loaded.filter((name) => item.forbidden.includes(name)),
    baselineContaminated: label === "without_skill" && parsed.loaded.length > 0,
    answer: parsed.final, error: valid ? null : { code: result.code, timedOut: result.timedOut, limited: result.limited, parseError: parsed.parseError, stderr: result.stderr },
  };
}

export function summarize(records, items) {
  return items.map((item) => {
    const candidate = records.filter((r) => r.id === item.id && r.group === "with_skill");
    const baseline = records.filter((r) => r.id === item.id && r.group === "without_skill");
    const valid = candidate.filter((r) => r.valid);
    const route = valid.filter((r) => r.expectedLoaded && r.forbiddenLoaded.length === 0).length;
    return { id: item.id, expected: item.expected, valid: valid.length, attempts: candidate.length,
      triggerRate: valid.length ? route / valid.length : null,
      forbiddenInvocations: valid.filter((r) => r.forbiddenLoaded.length > 0).length,
      baselineFailures: baseline.filter((r) => !r.valid || r.baselineContaminated).length,
      status: valid.length !== candidate.length || baseline.some((r) => !r.valid || r.baselineContaminated) ? "invalid" : route >= Math.ceil(candidate.length * 2 / 3) && valid.every((r) => r.forbiddenLoaded.length === 0) ? "route_pass" : "route_fail",
      outputQuality: "manual_review_required" };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(usage); return; }
  const { cases, names } = loadCases(resolve(options.cases));
  const selected = cases.slice(0, options.limit);
  if (!options.live) { console.log(`预览: ${selected.length} 个案例 × ${options.runs} 次 × 有/无 Skill = ${selected.length * options.runs * 2} 次模型请求。\n运行需 --live --model PROVIDER/MODEL；不会在预览时调用模型。`); return; }
  const out = resolve(options.resume || options.out || join(root, ".skill-replay-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`));
  if (options.resume) {
    if (!existsSync(join(out, "runs.json")) || !existsSync(join(out, "meta.json"))) throw new Error(`恢复目录缺少 runs.json 或 meta.json: ${out}`);
    const previous = JSON.parse(readFileSync(join(out, "meta.json"), "utf8"));
    if (previous.model !== options.model || previous.runs !== options.runs || previous.cases !== resolve(options.cases)) throw new Error("恢复参数须与原运行的模型、次数和案例文件一致");
  } else if (existsSync(out)) throw new Error(`输出目录已存在，拒绝覆盖: ${out}`);
  mkdirSync(out, { recursive: true });
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const changes = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  const metadata = { model: options.model, pi: options.pi, runs: options.runs, gitCommit: git.status === 0 ? git.stdout.trim() : null, workingTreeDirty: changes.status !== 0 || Boolean(changes.stdout.trim()), date: new Date().toISOString(), fixture, cases: resolve(options.cases), selected };
  const records = options.resume ? JSON.parse(readFileSync(join(out, "runs.json"), "utf8")) : [];
  const completed = new Set(records.map((record) => `${record.id}:${record.repetition}:${record.group}`));
  // Write each run immediately so interrupted or costly runs are not silently lost.
  try {
    for (const item of selected) for (let repetition = 1; repetition <= options.runs; repetition++) {
      for (const group of ["without_skill", "with_skill"]) {
        if (completed.has(`${item.id}:${repetition}:${group}`)) continue;
        const args = ["--mode", "json", "--no-session", "--offline", "--no-extensions", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-skills", "--tools", "read", "--model", options.model];
        if (group === "with_skill") for (const name of names) args.push("--skill", join(skillRoot, name));
        args.push("--", item.request);
        const run = reportRun(await callPi(options.pi, args), group, item, repetition);
        records.push(run);
        writeFileSync(join(out, "runs.json"), JSON.stringify(records, null, 2) + "\n");
        console.log(`${item.id} #${repetition} ${group}: ${run.valid ? run.loaded.join(",") || "未加载" : "无效运行"}`);
      }
    }
  } finally {
    writeFileSync(join(out, "meta.json"), JSON.stringify(metadata, null, 2) + "\n");
    writeFileSync(join(out, "summary.json"), JSON.stringify(summarize(records, selected), null, 2) + "\n");
    console.log(`报告: ${out}；触发统计见 summary.json，产物质量请人工对照 runs.json 评审。`);
  }
  if (summarize(records, selected).some((s) => s.status !== "route_pass")) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

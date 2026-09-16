import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import { validateSkills } from "../../scripts/validate-skills.mjs";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));

function codes(name) {
  return validateSkills(join(fixtures, name, "skills")).errors.map((error) => error.code);
}

test("accepts valid skills and README coverage", () => {
  const result = validateSkills(join(fixtures, "valid", "skills"));
  assert.equal(result.ok, true);
  assert.equal(result.skillCount, 2);
  assert.deepEqual(result.errors, []);
});

test("detects duplicate names and directory/name mismatches", () => {
  const result = codes("duplicate");
  assert.ok(result.includes("duplicate_name"));
  assert.ok(result.includes("name_directory_mismatch"));
});

test("detects malformed frontmatter and missing trigger boundaries", () => {
  const result = codes("metadata");
  assert.ok(result.includes("invalid_frontmatter"));
  assert.ok(result.includes("missing_exclusion_boundary"));
});

test("detects broken and escaping relative links", () => {
  const result = codes("links");
  assert.ok(result.includes("broken_relative_link"));
  assert.ok(result.includes("link_escapes_skill"));
});

test("detects README omissions and unknown entries", () => {
  const result = codes("readme-drift");
  assert.ok(result.includes("readme_missing_skill"));
  assert.ok(result.includes("readme_unknown_skill"));
});

test("detects incomplete trigger contracts and unknown skill references", () => {
  const result = codes("evals");
  assert.ok(result.includes("insufficient_positive_trigger_cases"));
  assert.ok(result.includes("insufficient_negative_trigger_cases"));
  assert.ok(result.includes("unknown_expected_skill"));
  assert.ok(result.includes("contradictory_trigger_case"));
});

test("detects forced skill chains and orphan references", () => {
  const temporary = mkdtempSync(join(tmpdir(), "agent-kit-references-"));
  const skills = join(temporary, "skills");
  try {
    cpSync(join(fixtures, "valid", "skills"), skills, { recursive: true });
    const alpha = join(skills, "alpha");
    mkdirSync(join(alpha, "references"), { recursive: true });
    writeFileSync(join(alpha, "references", "unused.md"), "# 未引用资料\n");
    writeFileSync(join(alpha, "SKILL.md"), `---
name: alpha
description: 仅在需要 Alpha 时使用；不用于 Beta。
---

# Alpha

自动加载 \`beta\` Skill。
`);
    const errors = validateSkills(skills).errors.map((error) => error.code);
    assert.ok(errors.includes("forced_skill_chain"));
    assert.ok(errors.includes("orphan_reference"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("detects malformed and ambiguous cross-skill conflict cases", () => {
  const temporary = mkdtempSync(join(tmpdir(), "agent-kit-conflicts-"));
  const skills = join(temporary, "skills");
  try {
    cpSync(join(fixtures, "valid", "skills"), skills, { recursive: true });
    mkdirSync(join(skills, "evals"));
    writeFileSync(join(skills, "evals", "conflicts.json"), JSON.stringify({
      cases: [
        { request: "同一个请求", expected: "alpha", forbidden: ["beta"] },
        { request: "同一个请求", expected: "beta", forbidden: ["alpha"] },
        { request: "矛盾请求", expected: "alpha", forbidden: ["alpha"] },
        { request: "未知请求", expected: "missing", forbidden: ["beta"] },
      ],
    }));
    const result = validateSkills(skills);
    const errors = result.errors.map((error) => error.code);
    assert.ok(errors.includes("ambiguous_conflict_case"));
    assert.ok(errors.includes("contradictory_conflict_case"));
    assert.ok(errors.includes("unknown_conflict_expected_skill"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

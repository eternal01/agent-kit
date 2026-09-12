import assert from "node:assert/strict";
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

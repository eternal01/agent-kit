import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import { validateMinimalChangeBenchmarks } from "../../scripts/validate-minimal-change-benchmarks.mjs";

const cases = fileURLToPath(new URL("../../benchmarks/minimal-change/cases.json", import.meta.url));

test("accepts the repository minimal-change benchmark suite", () => {
  assert.deepEqual(validateMinimalChangeBenchmarks(cases), []);
});

test("rejects malformed benchmark cases", () => {
  const directory = mkdtempSync(join(tmpdir(), "minimal-change-benchmarks-"));
  const path = join(directory, "cases.json");
  try {
    const malformed = { id: "duplicate", request: "x", expected_strategies: ["x"], forbidden_changes: ["x"], protected_invariants: ["x"], verification: ["x"], complexity_metrics: ["unknown"] };
    writeFileSync(path, JSON.stringify({ cases: Array.from({ length: 8 }, () => malformed) }));
    const codes = validateMinimalChangeBenchmarks(path).map((error) => error.code);
    assert.ok(codes.includes("duplicate_case_id"));
    assert.ok(codes.includes("unknown_metric"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

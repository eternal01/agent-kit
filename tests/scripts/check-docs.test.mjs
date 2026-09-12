import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocs } from "../../scripts/check-docs.mjs";

test("accepts concrete documentation with valid local links", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-valid-"));
  await mkdir(join(root, "guide"));
  await writeFile(join(root, "README.md"), "# Project\n\nRead the [guide](guide/topic.md).\n");
  await writeFile(join(root, "guide/topic.md"), "# Topic\n\nRun the command from the repository root.\n");
  assert.deepEqual(checkDocs(root), []);
});

test("reports broken links, scaffold readmes, template markers, and duplicate paragraphs", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-invalid-"));
  await mkdir(join(root, "empty"));
  const repeated = "This paragraph is long enough to be an accidental duplicated documentation paragraph.";
  await writeFile(join(root, "README.md"), `# <主题>\n\n[missing](none.md)\n\n${repeated}\n\n${repeated}\n`);
  await writeFile(join(root, "empty/README.md"), "# Empty\n\n存放以后可能添加的内容。\n");
  const codes = checkDocs(root).map((error) => error.code);
  assert.ok(codes.includes("broken_document_link"));
  assert.ok(codes.includes("placeholder_readme"));
  assert.ok(codes.includes("template_marker"));
  assert.ok(codes.includes("duplicate_paragraph"));
});

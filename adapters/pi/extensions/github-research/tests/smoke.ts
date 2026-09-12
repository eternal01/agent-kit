import assert from "node:assert/strict";
import extension from "../index.ts";

const tools: string[] = [];
const commands: string[] = [];

extension({
  registerTool(tool: { name: string }) {
    tools.push(tool.name);
  },
  registerCommand(name: string) {
    commands.push(name);
  },
} as any);

assert.deepEqual(tools, ["github_research", "github_repository_details"]);
assert.deepEqual(commands, ["github-research-doctor"]);
console.log("github-research smoke: OK");

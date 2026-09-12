import extension from "../index.ts";

const tools = new Map<string, unknown>();
extension({
  registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
} as never);

const expected = ["anytype_search", "anytype_get", "anytype_create", "anytype_update"];
for (const name of expected) if (!tools.has(name)) throw new Error(`missing tool: ${name}`);
console.log(`anytype smoke: OK (${tools.size} tools)`);

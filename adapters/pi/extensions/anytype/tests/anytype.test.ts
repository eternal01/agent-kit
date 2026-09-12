import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, resolveSpaceId, validateProperties } from "../client.ts";

test("loadConfig rejects remote HTTP and permits explicit remote HTTPS", () => {
  assert.throws(() => loadConfig({ ANYTYPE_BASE_URL: "http://example.test" } as NodeJS.ProcessEnv), /只允许本机地址/);
  const config = loadConfig({ ANYTYPE_BASE_URL: "https://example.test", ANYTYPE_ALLOW_REMOTE: "1", ANYTYPE_API_KEY: "secret" } as NodeJS.ProcessEnv);
  assert.equal(config.baseUrl, "https://example.test");
});

test("loadConfig rejects unsupported protocols", () => {
  assert.throws(() => loadConfig({ ANYTYPE_BASE_URL: "file:///tmp/anytype" } as NodeJS.ProcessEnv), /HTTP 或 HTTPS/);
});

test("resolveSpaceId requires an explicit or configured space", () => {
  assert.equal(resolveSpaceId({} as never, "space-1"), "space-1");
  assert.equal(resolveSpaceId({ defaultSpaceId: "default" } as never), "default");
  assert.throws(() => resolveSpaceId({} as never), /缺少 space_id/);
});

test("validateProperties requires exactly one value field", () => {
  assert.deepEqual(validateProperties([{ key: "status", select: "open" }]), [{ key: "status", select: "open" }]);
  assert.throws(() => validateProperties([{ key: "bad" }]), /只能设置一个值字段/);
  assert.throws(() => validateProperties([{ key: "bad", text: "x", number: 1 }]), /只能设置一个值字段/);
});

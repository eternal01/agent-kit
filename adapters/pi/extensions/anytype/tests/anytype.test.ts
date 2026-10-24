import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { AnytypeClient, loadConfig, resolveSpaceId, validateProperties } from "../client.ts";

test("loadConfig rejects remote HTTP and permits explicit remote HTTPS", () => {
  assert.throws(() => loadConfig({ ANYTYPE_BASE_URL: "http://example.test" } as NodeJS.ProcessEnv), /只允许本机地址/);
  const config = loadConfig({ ANYTYPE_BASE_URL: "https://example.test", ANYTYPE_ALLOW_REMOTE: "1", ANYTYPE_API_KEY: "secret" } as NodeJS.ProcessEnv);
  assert.equal(config.baseUrl, "https://example.test");
});

test("loadConfig accepts IPv6 loopback without allowing remote HTTP", () => {
  assert.equal(loadConfig({ ANYTYPE_BASE_URL: "http://[::1]:31010" }).baseUrl, "http://[::1]:31010");
  assert.throws(() => loadConfig({ ANYTYPE_BASE_URL: "http://[2001:db8::1]:31010" }), /只允许本机地址/);
});

test("client requests IPv6 loopback using an unbracketed connection hostname", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("Connection", "close");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "::1", resolve);
    });
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes((error as NodeJS.ErrnoException).code || "")) {
      t.skip("IPv6 loopback is unavailable on this host");
      return;
    }
    throw error;
  }
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const port = (server.address() as AddressInfo).port;
  const client = new AnytypeClient(loadConfig({
    ANYTYPE_BASE_URL: `http://[::1]:${port}`,
    ANYTYPE_HOST_HEADER: `[::1]:${port}`,
    ANYTYPE_API_KEY: "test-key-not-a-real-credential",
  }));
  assert.deepEqual(await client.request("GET", "/v1/test"), { ok: true });
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

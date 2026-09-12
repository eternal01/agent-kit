import { execFile } from "node:child_process";
import type { GhFailure } from "./types.ts";

const MAX_BUFFER = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const responseCache = new Map<string, { value: string; expiresAt: number }>();

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { stderr?: unknown; message?: unknown };
  return String(value.stderr || value.message || error);
}

export function classifyGhError(error: unknown): GhFailure {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  const detail = errorText(error).trim();
  const lower = detail.toLowerCase();

  if (value.code === "ENOENT" || lower.includes("command not found")) {
    return { kind: "gh_not_found", message: "未找到 gh。请先安装 GitHub CLI：https://cli.github.com/" };
  }
  if (lower.includes("gh auth login") || lower.includes("not logged") || lower.includes("authentication required")) {
    return { kind: "not_authenticated", message: "GitHub CLI 尚未认证。请先执行 gh auth login。" };
  }
  if (lower.includes("rate limit") || lower.includes("http 403") && lower.includes("limit")) {
    return { kind: "rate_limited", message: `GitHub API 已限流。请稍后重试并用 gh api rate_limit 检查额度。${detail ? `\n${detail}` : ""}` };
  }
  return { kind: "api_error", message: `GitHub API 请求失败。${detail ? `\n${detail}` : ""}` };
}

export function clearGhCache(): void {
  responseCache.clear();
}

export async function runGhCached(
  args: string[],
  signal?: AbortSignal,
  ttlMs = 300_000,
  executable = "gh",
): Promise<string> {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  if (ttlMs <= 0) return runGh(args, signal, executable);

  const key = JSON.stringify([executable, args]);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) responseCache.delete(key);

  const value = await runGh(args, signal, executable);
  const now = Date.now();
  for (const [cachedKey, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(cachedKey);
  }
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) break;
    responseCache.delete(oldestKey);
  }
  responseCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function runGh(args: string[], signal?: AbortSignal, executable = "gh"): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, GH_PAGER: "cat" },
      signal,
    }, (error, stdout) => {
      if (error) {
        if (error.name === "AbortError" || signal?.aborted) {
          reject(error);
          return;
        }
        const failure = classifyGhError(error);
        reject(Object.assign(new Error(failure.message), { kind: failure.kind, cause: error }));
        return;
      }
      resolve(String(stdout));
    });
  });
}

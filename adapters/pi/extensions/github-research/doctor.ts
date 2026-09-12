import { runGh } from "./github-client.ts";

export interface DoctorCheck {
  name: "github_cli" | "authentication" | "api_rate_limit";
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checked_at: string;
  checks: DoctorCheck[];
}

type GhRunner = (args: string[], signal?: AbortSignal) => Promise<string>;

function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDoctor(runner: GhRunner = runGh, signal?: AbortSignal): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  try {
    const version = (await runner(["--version"], signal)).split("\n", 1)[0].trim();
    checks.push({ name: "github_cli", ok: true, detail: version || "gh available" });
  } catch (error) {
    checks.push({ name: "github_cli", ok: false, detail: failureDetail(error) });
  }

  try {
    await runner(["auth", "status", "--hostname", "github.com"], signal);
    checks.push({ name: "authentication", ok: true, detail: "authenticated to github.com" });
  } catch (error) {
    checks.push({ name: "authentication", ok: false, detail: failureDetail(error) });
  }

  try {
    const payload = JSON.parse(await runner(["api", "rate_limit"], signal)) as {
      resources?: { core?: { limit?: number; remaining?: number }; search?: { limit?: number; remaining?: number } };
    };
    const core = payload.resources?.core;
    const search = payload.resources?.search;
    if (![core?.limit, core?.remaining, search?.limit, search?.remaining].every((value) => typeof value === "number")) {
      throw new Error("GitHub rate_limit response is missing core or search counters");
    }
    checks.push({
      name: "api_rate_limit",
      ok: Number(core?.remaining) > 0 && Number(search?.remaining) > 0,
      detail: `core ${core?.remaining}/${core?.limit}, search ${search?.remaining}/${search?.limit}`,
    });
  } catch (error) {
    checks.push({ name: "api_rate_limit", ok: false, detail: failureDetail(error) });
  }

  return {
    ok: checks.every((check) => check.ok),
    checked_at: new Date().toISOString(),
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = report.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`);
  return [`GitHub Research Doctor (${report.ok ? "ready" : "needs attention"})`, ...lines].join("\n");
}

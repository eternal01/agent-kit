import { runGhCached } from "./github-client.ts";
import { analyzeRepositoryTree, scoreMaturity, summarizeIssues } from "./maturity.ts";
import { inspectExternalContent } from "./security.ts";

export interface RepositoryInspectionOptions {
  signal?: AbortSignal;
  cacheTtlMs?: number;
  analyzeMaturity?: boolean;
  includeReadme?: boolean;
  readmeMaxBytes?: number;
}

export type RepositoryEvidence = Record<string, any> & {
  full_name: string;
  html_url: string;
  release_sample: Array<Record<string, unknown>>;
  evidence_collection_errors: string[];
};

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || Boolean(error && typeof error === "object" && (error as { name?: string }).name === "AbortError");
}

async function optionalGh(
  endpoint: string,
  label: string,
  errors: string[],
  signal: AbortSignal | undefined,
  cacheTtlMs: number,
): Promise<string> {
  try {
    return await runGhCached(["api", endpoint], signal, cacheTtlMs);
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

function parseArray(value: string): Array<Record<string, any>> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface PiResourceVerification {
  verified: boolean;
  resources: string[];
  reasons: string[];
  errors?: string[];
}

export function verifyPiResources(input: { packageJson?: Record<string, any>; paths: string[] }): PiResourceVerification {
  const packagePi = input.packageJson?.pi ?? {};
  const resources: string[] = [];
  const reasons: string[] = [];
  if (Array.isArray(packagePi.extensions) && packagePi.extensions.length > 0) {
    resources.push("extensions");
    reasons.push("package.json declares pi.extensions");
  }
  if (Array.isArray(packagePi.skills) && packagePi.skills.length > 0) {
    resources.push("skills");
    reasons.push("package.json declares pi.skills");
  }
  const paths = input.paths.map((path) => path.toLowerCase());
  if (!resources.includes("skills") && paths.some((path) => /(^|\/)skills?\/.*skill\.md$/.test(path))) {
    resources.push("skills");
    reasons.push("repository contains a skills/SKILL.md layout");
  }
  if (!resources.includes("extensions") && paths.some((path) => /(^|\/)extensions?\/.*\.(ts|js|mjs|cjs)$/.test(path))) {
    resources.push("extensions");
    reasons.push("repository contains an extensions code layout");
  }
  return { verified: resources.length > 0, resources, reasons };
}

export async function inspectPiResources(
  repository: string,
  defaultBranch = "main",
  options: Pick<RepositoryInspectionOptions, "signal" | "cacheTtlMs"> = {},
): Promise<PiResourceVerification> {
  const fullName = validateRepositoryName(repository);
  const branch = encodeURIComponent(defaultBranch);
  const errors: string[] = [];
  const cacheTtlMs = options.cacheTtlMs ?? 300_000;
  const treeRaw = await optionalGh(`repos/${fullName}/git/trees/${branch}?recursive=1`, "repository_tree", errors, options.signal, cacheTtlMs);
  let tree: { tree?: Array<{ path?: string }> } = {};
  try { tree = JSON.parse(treeRaw); } catch { /* Missing trees are reported as unverified. */ }
  const paths = (tree.tree ?? []).map((entry) => entry.path).filter((path): path is string => Boolean(path));
  let packageJson: Record<string, any> = {};
  if (paths.some((path) => path === "package.json")) {
    const packageRaw = await optionalGh(`repos/${fullName}/contents/package.json?ref=${branch}`, "package_json", errors, options.signal, cacheTtlMs);
    try {
      const response = JSON.parse(packageRaw) as { content?: string };
      if (response.content) packageJson = JSON.parse(Buffer.from(response.content.replace(/\s/g, ""), "base64").toString("utf8"));
    } catch { /* Invalid or unavailable package metadata is not verification evidence. */ }
  }
  return { ...verifyPiResources({ packageJson, paths }), errors };
}

export function selectVerifiedPiRepositories(
  candidates: Record<string, any>[],
  verifications: Map<string, PiResourceVerification>,
  limit: number,
): Record<string, any>[] {
  return candidates.flatMap((candidate) => {
    const verification = typeof candidate.full_name === "string" ? verifications.get(candidate.full_name) : undefined;
    if (!verification?.verified) return [];
    return [{
      ...candidate,
      pi_package_verified: true,
      pi_resources: verification.resources,
      pi_verification_reasons: verification.reasons,
    }];
  }).slice(0, limit);
}

export function validateRepositoryName(value: string): string {
  const repository = value.trim();
  if (!/^(?!-)[A-Za-z0-9-]{1,39}(?<!-)\/[A-Za-z0-9._-]{1,100}$/.test(repository)) {
    throw new Error("repository 必须是 owner/name 格式，而不是 URL 或额外路径");
  }
  return repository;
}

export async function inspectRepository(
  repository: string,
  options: RepositoryInspectionOptions = {},
): Promise<RepositoryEvidence> {
  const fullName = validateRepositoryName(repository);
  const signal = options.signal;
  const cacheTtlMs = options.cacheTtlMs ?? 300_000;
  const analyzeMaturity = options.analyzeMaturity ?? true;
  const includeReadme = options.includeReadme ?? false;
  const repoRaw = await runGhCached(["api", `repos/${fullName}`], signal, cacheTtlMs);
  const repo = JSON.parse(repoRaw) as Record<string, any>;
  const branch = encodeURIComponent(String(repo.default_branch || "main"));
  const evidenceErrors: string[] = [];

  const [readmeRaw, releasesRaw, contributorsRaw, treeRaw, packageRaw, openIssuesRaw, closedIssuesRaw] = await Promise.all([
    includeReadme ? optionalGh(`repos/${fullName}/readme`, "readme", evidenceErrors, signal, cacheTtlMs) : "",
    optionalGh(`repos/${fullName}/releases?per_page=10`, "releases", evidenceErrors, signal, cacheTtlMs),
    analyzeMaturity ? optionalGh(`repos/${fullName}/contributors?per_page=100&anon=true`, "contributors", evidenceErrors, signal, cacheTtlMs) : "",
    optionalGh(`repos/${fullName}/git/trees/${branch}?recursive=1`, "repository_tree", evidenceErrors, signal, cacheTtlMs),
    optionalGh(`repos/${fullName}/contents/package.json?ref=${branch}`, "package_json", evidenceErrors, signal, cacheTtlMs),
    analyzeMaturity ? optionalGh(`repos/${fullName}/issues?state=open&sort=created&direction=asc&per_page=100`, "open_issues", evidenceErrors, signal, cacheTtlMs) : "",
    analyzeMaturity ? optionalGh(`repos/${fullName}/issues?state=closed&sort=updated&direction=desc&per_page=30`, "closed_issues", evidenceErrors, signal, cacheTtlMs) : "",
  ]);

  let readme;
  if (includeReadme) {
    readme = inspectExternalContent("", options.readmeMaxBytes ?? 3_000);
    try {
      const response = JSON.parse(readmeRaw) as { content?: string };
      if (response.content) {
        const decoded = Buffer.from(response.content.replace(/\s/g, ""), "base64").toString("utf8");
        readme = inspectExternalContent(decoded, options.readmeMaxBytes ?? 3_000);
      }
    } catch {
      // The collection error already records unavailable README responses.
    }
  }

  const releases = parseArray(releasesRaw);
  const releaseSample = releases.map((release) => ({
    tag_name: release.tag_name,
    published_at: release.published_at,
    html_url: release.html_url,
  }));
  let tree: { tree?: Array<{ path?: string }>; truncated?: boolean } = {};
  try { tree = JSON.parse(treeRaw); } catch { /* Tree analysis is optional. */ }
  const treePaths = (tree.tree ?? []).map((entry) => entry.path).filter((path): path is string => Boolean(path));
  const treeAnalysis = analyzeRepositoryTree(treePaths);
  let packageJson: Record<string, any> = {};
  try {
    const packageResponse = JSON.parse(packageRaw) as { content?: string };
    if (packageResponse.content) packageJson = JSON.parse(Buffer.from(packageResponse.content.replace(/\s/g, ""), "base64").toString("utf8"));
  } catch {
    // package.json is optional for non-JavaScript repositories.
  }
  const piResources = verifyPiResources({ packageJson, paths: treePaths });
  const contributors = parseArray(contributorsRaw);
  const issueMetrics = summarizeIssues(parseArray(openIssuesRaw), parseArray(closedIssuesRaw));
  const maturity = analyzeMaturity ? scoreMaturity({
    stars: Number(repo.stargazers_count ?? 0),
    forks: Number(repo.forks_count ?? 0),
    archived: Boolean(repo.archived),
    pushed_at: repo.pushed_at,
    license: repo.license?.spdx_id,
    releases: releases.map((release) => release.published_at).filter((date): date is string => typeof date === "string"),
    contributor_count: contributors.length,
    contributor_count_capped: contributors.length >= 100,
    closed_issue_median_days: issueMetrics.closed_issue_median_days,
    engineering: treeAnalysis.engineering,
  }) : null;
  if (maturity && evidenceErrors.length > 0) maturity.warnings.push("partial_evidence_collection");

  return {
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    homepage: repo.homepage,
    license: repo.license?.spdx_id ?? null,
    topics: repo.topics,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    subscribers_count: repo.subscribers_count,
    open_issues_count_including_pull_requests: repo.open_issues_count,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    archived: repo.archived,
    default_branch: repo.default_branch,
    release_sample: releaseSample,
    maturity_analysis_enabled: analyzeMaturity,
    contributor_sample_count: analyzeMaturity ? contributors.length : null,
    contributor_count_capped: analyzeMaturity ? contributors.length >= 100 : null,
    issue_metrics: analyzeMaturity ? issueMetrics : null,
    engineering_signals: analyzeMaturity ? treeAnalysis.engineering : null,
    architecture_signals: analyzeMaturity ? treeAnalysis.architecture : null,
    pi_package_verified: piResources.verified,
    pi_resources: piResources.resources,
    pi_verification_reasons: piResources.reasons,
    repository_tree_truncated: analyzeMaturity ? Boolean(tree.truncated) : null,
    evidence_collection_errors: evidenceErrors,
    maturity,
    ...(includeReadme ? { readme_excerpt: readme } : {}),
  };
}

export function compactRepositoryEvidence(evidence: RepositoryEvidence, includeReadme: boolean): Record<string, any> {
  const architecture = evidence.architecture_signals ? {
    ...evidence.architecture_signals,
    top_level_areas: evidence.architecture_signals.top_level_areas?.slice(0, 8),
  } : evidence.architecture_signals;
  const maturity = evidence.maturity ? {
    score: evidence.maturity.score,
    grade: evidence.maturity.grade,
    warnings: evidence.maturity.warnings,
  } : evidence.maturity;
  const compact = {
    full_name: evidence.full_name,
    latest_release: evidence.release_sample?.[0] ?? null,
    release_sample_count: evidence.release_sample?.length ?? 0,
    contributor_sample_count: evidence.contributor_sample_count,
    contributor_count_capped: evidence.contributor_count_capped,
    issue_metrics: evidence.issue_metrics,
    engineering_signals: evidence.engineering_signals,
    architecture_signals: architecture,
    pi_package_verified: evidence.pi_package_verified,
    pi_resources: evidence.pi_resources,
    pi_verification_reasons: evidence.pi_verification_reasons,
    repository_tree_truncated: evidence.repository_tree_truncated,
    evidence_collection_errors: evidence.evidence_collection_errors?.slice(0, 5).map((error: string) => error.slice(0, 300)),
    maturity,
  } as Record<string, any>;
  if (includeReadme && evidence.readme_excerpt) compact.readme_excerpt = evidence.readme_excerpt;
  return compact;
}

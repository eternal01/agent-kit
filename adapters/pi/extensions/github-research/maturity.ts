export interface EngineeringSignals {
  has_ci: boolean;
  has_tests: boolean;
  has_docs: boolean;
  has_contributing: boolean;
  has_security_policy: boolean;
  has_code_of_conduct: boolean;
}

export interface MaturityEvidence {
  stars: number;
  forks: number;
  archived: boolean;
  pushed_at?: string | null;
  license?: string | null;
  releases: string[];
  contributor_count: number;
  contributor_count_capped: boolean;
  closed_issue_median_days?: number | null;
  engineering: EngineeringSignals;
}

function daysSince(value: string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 86_400_000) : Number.POSITIVE_INFINITY;
}

function adoptionScore(stars: number, forks: number): number {
  const starScore = Math.min(15, Math.round(Math.log10(Math.max(0, stars) + 1) * 4));
  const forkScore = Math.min(5, Math.round(Math.log10(Math.max(0, forks) + 1) * 2));
  return starScore + forkScore;
}

export function analyzeRepositoryTree(paths: string[]) {
  const normalized = paths.map((path) => path.replace(/^\.\//, ""));
  const lower = normalized.map((path) => path.toLowerCase());
  const has = (pattern: RegExp) => lower.some((path) => pattern.test(path));
  const packageManagers: string[] = [];
  if (has(/(^|\/)package\.json$/)) packageManagers.push("npm");
  if (has(/(^|\/)(pnpm-lock\.yaml|pnpm-workspace\.yaml)$/)) packageManagers.push("pnpm");
  if (has(/(^|\/)yarn\.lock$/)) packageManagers.push("yarn");
  if (has(/(^|\/)(bun\.lock|bun\.lockb)$/)) packageManagers.push("bun");
  if (has(/(^|\/)cargo\.toml$/)) packageManagers.push("cargo");
  if (has(/(^|\/)(pyproject\.toml|requirements\.txt)$/)) packageManagers.push("python");
  if (has(/(^|\/)go\.mod$/)) packageManagers.push("go");

  const topLevelAreas = [...new Set(normalized
    .filter((path) => path.includes("/"))
    .map((path) => path.split("/", 1)[0])
    .filter((area) => !area.startsWith(".")))]
    .slice(0, 20);
  const workspaceMarker = has(/(^|\/)(pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/)
    || has(/^package\.json$/) && normalized.some((path) => /^(packages|apps)\/[^/]+\/package\.json$/i.test(path));

  return {
    engineering: {
      has_ci: has(/^\.github\/workflows\/.+\.(yml|yaml)$/) || has(/^\.circleci\//) || has(/^\.travis\.ya?ml$/),
      has_tests: has(/(^|\/)(__tests__|tests?|specs?)(\/|$)/) || has(/\.(test|spec)\.[^/]+$/),
      has_docs: has(/^docs?\//) || has(/(^|\/)readme(\.[^/]+)?$/),
      has_contributing: has(/(^|\/)contributing(\.[^/]+)?$/),
      has_security_policy: has(/(^|\/)security(\.[^/]+)?$/),
      has_code_of_conduct: has(/(^|\/)code[_-]of[_-]conduct(\.[^/]+)?$/),
    },
    architecture: {
      monorepo: workspaceMarker,
      package_managers: packageManagers,
      top_level_areas: topLevelAreas,
      has_src_layout: normalized.some((path) => /(^|\/)src\//.test(path)),
      has_extension_directory: normalized.some((path) => /(^|\/)extensions?\//.test(path)),
      has_skills_directory: normalized.some((path) => /(^|\/)skills?\//.test(path)),
    },
  };
}

export function summarizeIssues(
  openItems: Array<Record<string, unknown>>,
  closedItems: Array<Record<string, unknown>>,
  now = new Date(),
) {
  const openIssues = openItems.filter((item) => !item.pull_request);
  const closedIssues = closedItems.filter((item) => !item.pull_request);
  const resolutionDays = closedIssues
    .map((item) => {
      const created = typeof item.created_at === "string" ? Date.parse(item.created_at) : Number.NaN;
      const closed = typeof item.closed_at === "string" ? Date.parse(item.closed_at) : Number.NaN;
      return Number.isFinite(created) && Number.isFinite(closed) ? Math.max(0, (closed - created) / 86_400_000) : Number.NaN;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const middle = Math.floor(resolutionDays.length / 2);
  const median = resolutionDays.length === 0
    ? null
    : resolutionDays.length % 2 === 0
      ? (resolutionDays[middle - 1] + resolutionDays[middle]) / 2
      : resolutionDays[middle];
  const oldestOpenDays = openIssues.length === 0
    ? null
    : Math.max(...openIssues.map((item) => daysSince(typeof item.created_at === "string" ? item.created_at : null, now)));

  return {
    open_issue_sample_count: openIssues.length,
    closed_issue_sample_count: closedIssues.length,
    oldest_open_issue_days: oldestOpenDays === null || !Number.isFinite(oldestOpenDays) ? null : Math.round(oldestOpenDays),
    closed_issue_median_days: median === null ? null : Math.round(median * 10) / 10,
    samples_capped: openItems.length >= 100 || closedItems.length >= 30,
  };
}

export function scoreMaturity(evidence: MaturityEvidence, now = new Date()) {
  const pushedDays = daysSince(evidence.pushed_at, now);
  const latestReleaseDays = evidence.releases.length > 0 ? daysSince(evidence.releases[0], now) : Number.POSITIVE_INFINITY;
  const components = {
    adoption: adoptionScore(evidence.stars, evidence.forks),
    maintenance: pushedDays <= 7 ? 20 : pushedDays <= 30 ? 16 : pushedDays <= 90 ? 11 : pushedDays <= 180 ? 5 : 0,
    releases: (latestReleaseDays <= 30 ? 10 : latestReleaseDays <= 90 ? 8 : latestReleaseDays <= 365 ? 5 : 0)
      + Math.min(5, evidence.releases.length),
    engineering: (evidence.engineering.has_ci ? 7 : 0)
      + (evidence.engineering.has_tests ? 7 : 0)
      + (evidence.engineering.has_docs ? 4 : 0)
      + (evidence.engineering.has_contributing ? 2 : 0)
      + (evidence.engineering.has_security_policy ? 3 : 0)
      + (evidence.engineering.has_code_of_conduct ? 2 : 0),
    governance: evidence.license && evidence.license !== "NOASSERTION" ? 10 : 0,
    community: Math.min(6, Math.round(Math.log10(Math.max(0, evidence.contributor_count) + 1) * 4))
      + (evidence.closed_issue_median_days == null ? 0 : evidence.closed_issue_median_days <= 7 ? 4 : evidence.closed_issue_median_days <= 30 ? 3 : evidence.closed_issue_median_days <= 90 ? 1 : 0),
    archive_penalty: 0,
  };
  const warnings: string[] = [];
  if (!evidence.license || evidence.license === "NOASSERTION") warnings.push("license_not_detected");
  if (pushedDays > 180) warnings.push("inactive_over_180_days");
  if (evidence.releases.length === 0) warnings.push("no_github_releases_detected");
  if (!evidence.engineering.has_ci) warnings.push("ci_not_detected");
  if (!evidence.engineering.has_tests) warnings.push("tests_not_detected");
  if (evidence.contributor_count_capped) warnings.push("contributor_count_capped");

  let score = Object.values(components).reduce((sum, value) => sum + value, 0);
  if (evidence.archived) {
    warnings.push("repository_archived");
    if (score > 25) components.archive_penalty = 25 - score;
    score = Math.min(score, 25);
  }

  return {
    score,
    evaluated_at: now.toISOString(),
    grade: score >= 80 ? "high" : score >= 60 ? "established" : score >= 40 ? "emerging" : "experimental_or_inactive",
    components,
    signals: {
      pushed_days_ago: Number.isFinite(pushedDays) ? Math.round(pushedDays) : null,
      latest_release_days_ago: Number.isFinite(latestReleaseDays) ? Math.round(latestReleaseDays) : null,
      release_sample_count: evidence.releases.length,
      contributor_count: evidence.contributor_count,
      contributor_count_capped: evidence.contributor_count_capped,
      closed_issue_median_days: evidence.closed_issue_median_days ?? null,
    },
    warnings,
    methodology: "0-100 heuristic: adoption 20, maintenance 20, releases 15, engineering 25, governance 10, community 10; archived repositories capped at 25",
  };
}

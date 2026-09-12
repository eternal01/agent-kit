const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /(reveal|print|show).{0,30}(secret|token|credential|api[ _-]?key)/i,
  /system\s+prompt/i,
  /you\s+are\s+now/i,
];

function truncateUtf8(value: string, maxBytes: number): { content: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return { content: value, truncated: false };
  let content = value.slice(0, maxBytes);
  while (Buffer.byteLength(content, "utf8") > maxBytes) content = content.slice(0, -1);
  return { content, truncated: true };
}

export function inspectExternalContent(value: string, maxBytes = 3_000) {
  const bounded = truncateUtf8(value, maxBytes);
  return {
    trusted: false,
    source_kind: "untrusted_external_content",
    content: bounded.content,
    truncated: bounded.truncated,
    security_warnings: INJECTION_PATTERNS.some((pattern) => pattern.test(value))
      ? ["possible_prompt_injection"]
      : [],
  };
}

function compactResult(item: Record<string, any>): Record<string, any> {
  return {
    full_name: item.full_name,
    name: item.name,
    html_url: item.html_url,
    description: typeof item.description === "string" ? truncateUtf8(item.description, 200).content : item.description,
    stargazers_count: item.stargazers_count,
    forks_count: item.forks_count,
    pushed_at: item.pushed_at,
    archived: item.archived,
    trending_score: item.trending_score,
    match_count: item.match_count,
    pi_package_verified: item.pi_package_verified,
    pi_resources: item.pi_resources,
  };
}

function compactInspection(item: Record<string, any>): Record<string, any> {
  return {
    full_name: item.full_name,
    html_url: item.html_url,
    description: typeof item.description === "string" ? truncateUtf8(item.description, 200).content : item.description,
    stargazers_count: item.stargazers_count,
    forks_count: item.forks_count,
    pushed_at: item.pushed_at,
    archived: item.archived,
    latest_release: item.latest_release,
    engineering_signals: item.engineering_signals,
    pi_package_verified: item.pi_package_verified,
    pi_resources: item.pi_resources,
    pi_verification_reasons: item.pi_verification_reasons,
    maturity: item.maturity ? { score: item.maturity.score, grade: item.maturity.grade, warnings: item.maturity.warnings } : item.maturity,
    inspection_error: typeof item.inspection_error === "string" ? truncateUtf8(item.inspection_error, 300).content : item.inspection_error,
    evidence_collection_error_count: Array.isArray(item.evidence_collection_errors) ? item.evidence_collection_errors.length : undefined,
  };
}

function identities(items: unknown): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      full_name: value.full_name,
      name: value.full_name === undefined ? value.name : undefined,
      html_url: value.html_url,
      pi_package_verified: value.pi_package_verified,
      pi_resources: value.pi_resources,
    };
  });
}

export function serializeBounded(payload: Record<string, unknown>, maxBytes = 60_000): string {
  const copy = structuredClone(payload) as Record<string, any>;
  const encode = () => JSON.stringify(copy, null, 2);
  let text = encode();
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  copy.output_truncated = true;
  const inspections = Array.isArray(copy.inspected_repositories) ? copy.inspected_repositories : [];
  for (const inspection of inspections) {
    const excerpt = inspection?.readme_excerpt;
    if (excerpt && typeof excerpt.content === "string") {
      excerpt.content = truncateUtf8(excerpt.content, 800).content;
      excerpt.truncated = true;
    }
  }
  text = encode();

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    copy.inspected_repositories = inspections.map(compactInspection);
    if (Array.isArray(copy.results)) copy.results = copy.results.map(compactResult);
    if (Array.isArray(copy.executed_queries)) {
      copy.executed_queries = copy.executed_queries.map((run: Record<string, any>) => ({
        ...run,
        query: typeof run.query === "string" ? truncateUtf8(run.query, 300).content : run.query,
        error: typeof run.error === "string" ? truncateUtf8(run.error, 300).content : run.error,
      }));
    }
    text = encode();
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    copy.results = identities(copy.results);
    copy.inspected_repositories = identities(copy.inspected_repositories);
    copy.caveats = ["Optional evidence was omitted to preserve every result and inspection identity within the output limit"];
    delete copy.executed_queries;
    text = encode();
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    const minimal = {
      source: copy.source,
      trust: copy.trust,
      output_truncated: true,
      results: identities(copy.results),
      inspected_repositories: identities(copy.inspected_repositories),
      error: "Optional evidence exceeded the configured output limit",
    };
    text = JSON.stringify(minimal);
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return JSON.stringify({ source: copy.source, output_truncated: true, error: "Result identities exceeded the configured output limit" });
  }
  return text;
}

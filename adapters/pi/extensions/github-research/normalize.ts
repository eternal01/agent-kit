import type { SearchItem, SearchType } from "./types.ts";

export function normalizeItem(item: SearchItem, type: SearchType): Record<string, unknown> {
  if (type === "repositories") {
    return {
      full_name: item.full_name,
      name: item.name,
      description: typeof item.description === "string" ? item.description.slice(0, 240) : item.description,
      html_url: item.html_url,
      stargazers_count: item.stargazers_count,
      forks_count: item.forks_count,
      language: item.language,
      topics: Array.isArray(item.topics) ? item.topics.slice(0, 10) : item.topics,
      license: item.license && (item.license as { spdx_id?: string }).spdx_id,
      updated_at: item.updated_at,
      pushed_at: item.pushed_at,
      archived: item.archived,
      default_branch: item.default_branch,
    };
  }

  if (type === "code") {
    return {
      name: item.name,
      path: item.path,
      sha: item.sha,
      html_url: item.html_url,
      repository: item.repository?.full_name,
      repository_url: item.repository?.html_url,
      score: item.score,
    };
  }

  const repository = item.repository?.full_name
    ?? (typeof item.repository_url === "string"
      ? item.repository_url.replace("https://api.github.com/repos/", "")
      : undefined);
  return {
    kind: type === "pull_requests" || item.pull_request ? "pull_request" : "issue",
    number: item.number,
    title: item.title,
    state: item.state,
    draft: item.draft,
    html_url: item.html_url,
    repository,
    comments: item.comments,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

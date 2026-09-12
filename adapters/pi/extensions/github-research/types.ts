export type SearchType = "repositories" | "code" | "issues" | "pull_requests";
export type SearchSort = "stars" | "forks" | "updated" | "best-match" | "trending";

export interface ResearchInput {
  query: string;
  queries?: string[];
  type?: SearchType;
  language?: string;
  min_stars?: number;
  sort?: SearchSort;
  limit?: number;
  inspect_top?: number;
  readme_top?: number;
  expand_query?: boolean;
  max_pages?: number;
  concurrency?: number;
  cache_ttl_seconds?: number;
  analyze_maturity?: boolean;
}

export interface SearchPlan {
  query: string;
  origin: "primary" | "additional" | "scope_expansion" | "topic_expansion";
}

export interface SearchPage {
  plan: SearchPlan;
  page: number;
  items: SearchItem[];
}

export type SearchItem = Record<string, unknown> & {
  full_name?: string;
  repository?: { full_name?: string; html_url?: string };
};

export interface GhFailure {
  kind: "gh_not_found" | "not_authenticated" | "rate_limited" | "api_error";
  message: string;
}

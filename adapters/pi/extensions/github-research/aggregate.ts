import { normalizeItem } from "./normalize.ts";
import type { SearchItem, SearchPage, SearchSort, SearchType } from "./types.ts";

export function trendingScore(item: SearchItem, matchCount: number, now = new Date()): number {
  const stars = Math.log10(Math.max(0, numberValue(item, "stargazers_count")) + 1) * 4;
  const forks = Math.log10(Math.max(0, numberValue(item, "forks_count")) + 1) * 1.5;
  const pushedAt = typeof item.pushed_at === "string" ? Date.parse(item.pushed_at) : Number.NaN;
  const ageDays = Number.isFinite(pushedAt) ? Math.max(0, (now.getTime() - pushedAt) / 86_400_000) : 3650;
  const recency = ageDays <= 7 ? 20 : ageDays <= 30 ? 15 : ageDays <= 90 ? 9 : ageDays <= 180 ? 4 : 0;
  return matchCount * 8 + stars + forks + recency;
}

interface AggregateEntry {
  item: SearchItem;
  queries: Set<string>;
  origins: Set<string>;
  score: number;
  trending: number;
}

function identityFor(item: SearchItem, type: SearchType): string | undefined {
  if (type === "repositories") return typeof item.full_name === "string" ? item.full_name : undefined;
  if (type === "code") {
    const repository = item.repository?.full_name;
    return repository && typeof item.path === "string" ? `${repository}:${item.path}:${String(item.sha ?? "")}` : undefined;
  }
  return typeof item.html_url === "string" ? item.html_url : undefined;
}

function numberValue(item: SearchItem, key: string): number {
  return typeof item[key] === "number" ? item[key] as number : 0;
}

export function aggregateSearchHits(
  pages: SearchPage[],
  type: SearchType,
  sort: SearchSort,
  limit: number,
): Record<string, unknown>[] {
  const entries = new Map<string, AggregateEntry>();
  for (const page of pages) {
    for (const item of page.items) {
      const identity = identityFor(item, type);
      if (!identity) continue;
      const existing = entries.get(identity) ?? {
        item,
        queries: new Set<string>(),
        origins: new Set<string>(),
        score: 0,
        trending: 0,
      };
      existing.queries.add(page.plan.query);
      existing.origins.add(page.plan.origin);
      existing.score = Math.max(existing.score, numberValue(item, "score"));
      existing.trending = trendingScore(item, existing.queries.size);
      entries.set(identity, existing);
    }
  }

  const values = [...entries.values()];
  values.sort((left, right) => {
    if (sort === "stars") return numberValue(right.item, "stargazers_count") - numberValue(left.item, "stargazers_count");
    if (sort === "forks") return numberValue(right.item, "forks_count") - numberValue(left.item, "forks_count");
    if (sort === "updated") return String(right.item.updated_at ?? "").localeCompare(String(left.item.updated_at ?? ""));
    if (sort === "best-match") return right.queries.size - left.queries.size || right.score - left.score;
    return right.trending - left.trending;
  });

  return values.slice(0, limit).map((entry) => ({
    ...normalizeItem(entry.item, type),
    match_count: entry.queries.size,
    matched_queries: [...entry.queries],
    match_origins: [...entry.origins],
    ...(sort === "best-match" ? {} : { trending_score: Math.round(entry.trending * 100) / 100 }),
  }));
}

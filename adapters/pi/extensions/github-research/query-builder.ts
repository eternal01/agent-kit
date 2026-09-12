import type { ResearchInput, SearchPlan, SearchType } from "./types.ts";

export function buildSearchQuery(input: ResearchInput): string {
  const terms = [input.query.trim()];
  if (input.type === "pull_requests") terms.push("is:pr");
  if (input.type === "issues") terms.push("is:issue");
  if (input.language?.trim()) terms.push(`language:${input.language.trim()}`);
  if (input.min_stars !== undefined && (input.type ?? "repositories") === "repositories") {
    terms.push(`stars:>=${input.min_stars}`);
  }
  return terms.join(" ");
}

function exactPhrase(query: string): string | undefined {
  if (/^"[^"\n]+"$/.test(query)) return query;
  if (query.includes(":") || query.includes('"')) return undefined;
  return `"${query.replace(/["\n]/g, " ").trim()}"`;
}

function topicFor(query: string): string | undefined {
  const normalized = query.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 ._-]*$/.test(normalized)) return undefined;
  const topic = normalized.replace(/[ ._]+/g, "-").replace(/-+/g, "-");
  return topic.length <= 50 ? topic : undefined;
}

export function buildSearchPlans(input: ResearchInput): SearchPlan[] {
  const bases = [input.query, ...(input.queries ?? [])]
    .map((query) => query.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const plans: SearchPlan[] = [];
  const seen = new Set<string>();
  const add = (query: string, origin: SearchPlan["origin"]) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    plans.push({ query, origin });
  };

  bases.forEach((base, index) => {
    add(base, index === 0 ? "primary" : "additional");
    if (input.expand_query === false) return;

    switch (input.type ?? "repositories") {
      case "repositories": {
        const phrase = exactPhrase(base);
        if (phrase) add(`${phrase} in:name,description`, "scope_expansion");
        const topic = topicFor(base);
        if (topic) add(`topic:${topic}`, "topic_expansion");
        break;
      }
      case "issues":
      case "pull_requests":
        add(`${base} in:title,body`, "scope_expansion");
        break;
      case "code":
        add(`${base} in:file`, "scope_expansion");
        break;
    }
  });
  return plans;
}

export function endpointFor(type: SearchType): string {
  switch (type) {
    case "code": return "search/code";
    case "issues":
    case "pull_requests": return "search/issues";
    default: return "search/repositories";
  }
}

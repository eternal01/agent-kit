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
      const bounded = truncateUtf8(excerpt.content, 800);
      excerpt.content = bounded.content;
      excerpt.truncated = true;
    }
  }
  text = encode();

  while (Buffer.byteLength(text, "utf8") > maxBytes && inspections.length > 0) {
    inspections.pop();
    text = encode();
  }

  const results = Array.isArray(copy.results) ? copy.results : [];
  while (Buffer.byteLength(text, "utf8") > maxBytes && results.length > 0) {
    results.pop();
    text = encode();
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return JSON.stringify({
      source: copy.source,
      output_truncated: true,
      error: "Result exceeded the configured output limit",
    });
  }
  return text;
}

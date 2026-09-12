#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", "fixtures"]);

function markdownFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
  }
  return files;
}

function withoutCode(content) {
  return content.replace(/```[\s\S]*?```/g, "");
}

function localLinks(content) {
  const links = [];
  for (const match of withoutCode(content).matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    else target = target.split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith("//")) continue;
    try { target = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]); } catch { target = target.split("#", 1)[0]; }
    if (target) links.push(target);
  }
  return links;
}

function duplicateParagraphs(content) {
  const seen = new Set();
  const duplicates = [];
  for (const paragraph of withoutCode(content).split(/\n\s*\n/)) {
    const normalized = paragraph.replace(/\s+/g, " ").trim();
    if (normalized.length < 60 || normalized.startsWith("#") || normalized.startsWith("|")) continue;
    if (seen.has(normalized)) duplicates.push(normalized);
    seen.add(normalized);
  }
  return duplicates;
}

export function checkDocs(rootDirectory) {
  const root = resolve(rootDirectory);
  const errors = [];
  const add = (code, path, message) => errors.push({ code, path: relative(root, path), message });
  for (const path of markdownFiles(root)) {
    const content = readFileSync(path, "utf8");
    for (const target of localLinks(content)) {
      const resolved = resolve(dirname(path), target);
      if (!existsSync(resolved)) add("broken_document_link", path, `relative link does not exist: ${target}`);
    }
    const lines = content.split("\n").filter((line) => line.trim());
    if (path.endsWith("README.md") && lines.length <= 3 && /存放.*(?:内容|记录|模板|示例)/.test(content)) {
      add("placeholder_readme", path, "README only describes content that does not exist");
    }
    if (/<(?:主题|路径|链接|待定|TODO)>/.test(withoutCode(content))) {
      add("template_marker", path, "unresolved template marker outside a code block");
    }
    for (const paragraph of duplicateParagraphs(content)) {
      add("duplicate_paragraph", path, `paragraph is repeated: ${paragraph.slice(0, 80)}`);
    }
  }
  return errors;
}

function runCli() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const root = resolve(process.argv[2] || resolve(scriptDirectory, ".."));
  const errors = checkDocs(root);
  if (errors.length === 0) {
    console.log("Documentation checks: OK");
    return;
  }
  for (const error of errors) console.error(`${error.code}: ${error.path}: ${error.message}`);
  console.error(`Documentation checks: FAILED (${errors.length} errors)`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();

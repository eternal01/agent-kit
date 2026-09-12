#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const fields = {};
  for (const line of content.slice(4, end).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (!match || Object.hasOwn(fields, match[1])) return null;
    fields[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return fields;
}

function markdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
  }
  return files;
}

function linkTargets(content) {
  const targets = [];
  const withoutCode = content.replace(/```[\s\S]*?```/g, "");
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of withoutCode.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    else target = target.split(/\s+["']/)[0];
    targets.push(target);
  }
  return targets;
}

function isIgnoredLink(target) {
  return !target
    || target.startsWith("#")
    || target.startsWith("//")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)
    || target === "URL";
}

function readmeSkills(readmePath) {
  if (!existsSync(readmePath)) return null;
  const names = [];
  for (const line of readFileSync(readmePath, "utf8").split("\n")) {
    const match = line.match(/^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|/);
    if (match) names.push(match[1]);
  }
  return names;
}

export function validateSkills(skillsDirectory) {
  const root = resolve(skillsDirectory);
  const errors = [];
  const skills = [];
  const addError = (code, path, message) => errors.push({ code, path: relative(root, path) || ".", message });

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { ok: false, skillCount: 0, errors: [{ code: "skills_directory_missing", path: root, message: "Skills directory does not exist" }] };
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillRoot = join(root, entry.name);
    const skillFile = join(skillRoot, "SKILL.md");
    if (!existsSync(skillFile)) {
      addError("skill_file_missing", skillRoot, "Immediate skill directories must contain SKILL.md");
      continue;
    }

    const content = readFileSync(skillFile, "utf8");
    const metadata = parseFrontmatter(content);
    if (!metadata) {
      addError("invalid_frontmatter", skillFile, "SKILL.md must start with a closed YAML frontmatter block");
      skills.push({ directory: entry.name, name: null, skillRoot });
    } else {
      const name = metadata.name;
      const description = metadata.description;
      if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        addError("invalid_name", skillFile, "frontmatter name must use kebab-case");
      } else if (name !== entry.name) {
        addError("name_directory_mismatch", skillFile, `frontmatter name '${name}' must equal directory '${entry.name}'`);
      }
      if (!description) {
        addError("missing_description", skillFile, "frontmatter description is required");
      } else {
        if (!/(仅在|适用于|(?<!不)用于|在.+(?:时|中)|use when|only when)/i.test(description)) {
          addError("missing_applicability_boundary", skillFile, "description must state when the skill applies");
        }
        if (!/(不用于|不负责|不替代|不适用|不得|do not use|not for)/i.test(description)) {
          addError("missing_exclusion_boundary", skillFile, "description must state when the skill does not apply");
        }
      }
      skills.push({ directory: entry.name, name: name || null, skillRoot });
    }

    for (const markdownFile of markdownFiles(skillRoot)) {
      const content = readFileSync(markdownFile, "utf8");
      for (const rawTarget of linkTargets(content)) {
        if (isIgnoredLink(rawTarget)) continue;
        let target;
        try { target = decodeURIComponent(rawTarget.split("#", 1)[0]); }
        catch { target = rawTarget.split("#", 1)[0]; }
        const resolved = resolve(dirname(markdownFile), target);
        if (isAbsolute(target) || !(resolved === skillRoot || resolved.startsWith(`${skillRoot}${sep}`))) {
          addError("link_escapes_skill", markdownFile, `relative link escapes skill directory: ${rawTarget}`);
        } else if (!existsSync(resolved)) {
          addError("broken_relative_link", markdownFile, `relative link does not exist: ${rawTarget}`);
        }
      }
    }
  }

  const names = new Map();
  for (const skill of skills) {
    if (!skill.name) continue;
    const previous = names.get(skill.name);
    if (previous) {
      addError("duplicate_name", join(skill.skillRoot, "SKILL.md"), `skill name '${skill.name}' is also used by ${previous}`);
    } else {
      names.set(skill.name, skill.directory);
    }
  }

  const readmePath = join(root, "README.md");
  const documented = readmeSkills(readmePath);
  if (documented === null) {
    addError("readme_missing", readmePath, "skills/README.md is required");
  } else {
    const directories = new Set(skills.map((skill) => skill.directory));
    const documentedSet = new Set(documented);
    if (documentedSet.size !== documented.length) {
      addError("readme_duplicate_skill", readmePath, "README contains duplicate skill entries");
    }
    for (const directory of directories) {
      if (!documentedSet.has(directory)) addError("readme_missing_skill", readmePath, `README is missing skill '${directory}'`);
    }
    for (const name of documentedSet) {
      if (!directories.has(name)) addError("readme_unknown_skill", readmePath, `README references unknown skill '${name}'`);
    }
  }

  return { ok: errors.length === 0, skillCount: skills.length, errors };
}

function runCli() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const skillsDirectory = resolve(process.argv[2] || join(scriptDirectory, "..", "skills"));
  const result = validateSkills(skillsDirectory);
  if (result.ok) {
    console.log(`Skill validation: OK (${result.skillCount} skills)`);
    return;
  }
  for (const error of result.errors) console.error(`${error.code}: ${error.path}: ${error.message}`);
  console.error(`Skill validation: FAILED (${result.errors.length} errors)`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();

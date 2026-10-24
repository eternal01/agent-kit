#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

target="$tmp/default"
mkdir -p "$target"
ln -s "$repo_root/skills/removed-skill" "$target/removed-skill"
AGENT_SKILLS_DIR="$target" "$repo_root/scripts/link-skills.sh" >/dev/null
[[ ! -e "$target/removed-skill" && ! -L "$target/removed-skill" ]]
[[ -L "$target/learning-note" ]]
[[ "$(readlink "$target/learning-note")" == "$repo_root/skills/learning-note" ]]

profiles="$tmp/profiles"
AGENT_SKILLS_DIR="$profiles" "$repo_root/scripts/link-skills.sh" --profile core-development >/dev/null
[[ "$(find "$profiles" -mindepth 1 -maxdepth 1 -type l | wc -l)" -eq 6 ]]
[[ -L "$profiles/codebase-onboarding" ]]
[[ -L "$profiles/session-handoff" ]]
[[ -f "$profiles/session-handoff/references/template.md" ]]
[[ -f "$profiles/session-handoff/evals/triggers.json" ]]
operations="$tmp/operations"
AGENT_SKILLS_DIR="$operations" "$repo_root/scripts/link-skills.sh" --profile operations >/dev/null
[[ "$(find "$operations" -mindepth 1 -maxdepth 1 -type l | wc -l)" -eq 3 ]]
[[ -L "$operations/incident-response" ]]
[[ -f "$operations/incident-response/references/response-structure.md" ]]
AGENT_SKILLS_DIR="$profiles" "$repo_root/scripts/link-skills.sh" --skill code-review --prune >/dev/null
[[ -L "$profiles/code-review" ]]
[[ "$(find "$profiles" -mindepth 1 -maxdepth 1 -type l | wc -l)" -eq 1 ]]
if AGENT_SKILLS_DIR="$profiles" "$repo_root/scripts/link-skills.sh" --skill missing >/dev/null 2>&1; then
  printf 'unknown Skill unexpectedly succeeded\n' >&2
  exit 1
fi
if AGENT_SKILLS_DIR="$profiles" "$repo_root/scripts/link-skills.sh" --profile missing >/dev/null 2>&1; then
  printf 'unknown profile unexpectedly succeeded\n' >&2
  exit 1
fi

snapshots="$tmp/snapshots"
AGENT_SKILLS_DIR="$snapshots" "$repo_root/scripts/build-skills.sh" --profile knowledge >/dev/null
[[ -f "$snapshots/web-research/.agent-kit-managed" ]]
AGENT_SKILLS_DIR="$snapshots" "$repo_root/scripts/build-skills.sh" --skill web-research --prune >/dev/null
[[ -d "$snapshots/web-research" ]]
[[ ! -e "$snapshots/learning-note" ]]
AGENT_SKILLS_DIR="$snapshots" "$repo_root/scripts/build-skills.sh" --skill session-handoff >/dev/null
[[ -f "$snapshots/session-handoff/.agent-kit-managed" ]]
[[ -f "$snapshots/session-handoff/references/template.md" ]]
# Preview must not create missing destination paths.
for installer in link-skills.sh build-skills.sh; do
  preview="$tmp/preview-$installer/nested"
  AGENT_SKILLS_DIR="$preview" "$repo_root/scripts/$installer" --skill code-review --dry-run >/dev/null
  [[ ! -e "$tmp/preview-$installer" ]]
done

# A foreign installation must survive a snapshot attempt unchanged.
foreign="$tmp/foreign"
mkdir -p "$foreign/code-review"
cp "$repo_root/skills/code-review/SKILL.md" "$foreign/code-review/SKILL.md"
touch "$foreign/code-review/user-customization"
if AGENT_SKILLS_DIR="$foreign" "$repo_root/scripts/build-skills.sh" --skill code-review >/dev/null 2>&1; then
  printf 'snapshot unexpectedly replaced an unmanaged directory\n' >&2
  exit 1
fi
[[ -f "$foreign/code-review/user-customization" ]]

# All conflicts must be discovered before cleanup or other installation changes.
ln -s "$repo_root/skills/removed-skill" "$foreign/removed-skill"
if AGENT_SKILLS_DIR="$foreign" "$repo_root/scripts/link-skills.sh" --skill code-review >/dev/null 2>&1; then exit 1; fi
[[ -L "$foreign/removed-skill" ]]

# A managed snapshot is backed up, not deleted, when updated.
backup_root="$tmp/skill-backups"
touch "$snapshots/web-research/user-customization"
AGENT_SKILLS_DIR="$snapshots" AGENT_SKILLS_BACKUP_DIR="$backup_root" "$repo_root/scripts/build-skills.sh" --skill web-research >/dev/null
[[ ! -e "$snapshots/web-research/user-customization" ]]
[[ "$(find "$backup_root" -name user-customization | wc -l)" -eq 1 ]]
AGENT_SKILLS_DIR="$foreign" AGENT_SKILLS_BACKUP_DIR="$backup_root" "$repo_root/scripts/link-skills.sh" --skill code-review --replace-copies >/dev/null
[[ -L "$foreign/code-review" ]]
[[ "$(find "$backup_root" -name user-customization | wc -l)" -eq 2 ]]

# Check source overlap only in a temporary repository; never risk real sources.
safe_repo="$tmp/repository"
mkdir -p "$safe_repo/scripts" "$safe_repo/skills"
cp "$repo_root"/scripts/*.sh "$safe_repo/scripts/"
cp -R "$repo_root/skills/code-review" "$safe_repo/skills/code-review"
ln -s "$safe_repo/skills" "$tmp/source-alias"
for installer in build-skills.sh link-skills.sh; do
  for unsafe in "$safe_repo/skills" "$tmp/source-alias" "$safe_repo/skills/nested" "$safe_repo"; do
    if AGENT_SKILLS_DIR="$unsafe" "$safe_repo/scripts/$installer" --skill code-review >/dev/null 2>&1; then
      printf 'installer unexpectedly accepted overlapping source and destination: %s\n' "$unsafe" >&2
      exit 1
    fi
    [[ -f "$safe_repo/skills/code-review/SKILL.md" ]]
  done
done
# Stage-copy failure must not move or delete a working managed installation.
failed_target="$tmp/copy-failure"
mkdir -p "$failed_target/code-review" "$tmp/failing-tools"
touch "$failed_target/code-review/.agent-kit-managed" "$failed_target/code-review/keep-me"
printf '#!/bin/sh\nexit 42\n' > "$tmp/failing-tools/cp"
chmod +x "$tmp/failing-tools/cp"
if AGENT_SKILLS_DIR="$failed_target" AGENT_SKILLS_BACKUP_DIR="$tmp/failed-backups" PATH="$tmp/failing-tools:$PATH" "$repo_root/scripts/build-skills.sh" --skill code-review >/dev/null 2>&1; then exit 1; fi
[[ -f "$failed_target/code-review/keep-me" ]]
[[ ! -e "$tmp/failed-backups" ]]
[[ -z "$(find "$failed_target" -name '.agent-kit-stage.*' -print -quit)" ]]

# Snapshot installation cannot replace an unrelated symlink, even if its target
# happens to have a management marker.
mkdir -p "$tmp/unrelated"
touch "$tmp/unrelated/.agent-kit-managed" "$tmp/unrelated/keep-me"
ln -s "$tmp/unrelated" "$tmp/snapshots/code-review"
if AGENT_SKILLS_DIR="$tmp/snapshots" "$repo_root/scripts/build-skills.sh" --skill code-review >/dev/null 2>&1; then exit 1; fi
[[ -L "$tmp/snapshots/code-review" && -f "$tmp/unrelated/keep-me" ]]
printf 'skill install lifecycle: OK\n'

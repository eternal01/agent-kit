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
[[ "$(find "$profiles" -mindepth 1 -maxdepth 1 -type l | wc -l)" -eq 5 ]]
[[ -L "$profiles/codebase-onboarding" ]]
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
printf 'skill install lifecycle: OK\n'

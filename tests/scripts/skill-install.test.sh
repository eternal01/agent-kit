#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

target="$tmp/skills"
mkdir -p "$target"
ln -s "$repo_root/skills/removed-skill" "$target/removed-skill"

AGENT_SKILLS_DIR="$target" "$repo_root/scripts/link-skills.sh" >/dev/null

[[ ! -e "$target/removed-skill" && ! -L "$target/removed-skill" ]]
[[ -L "$target/learning-note" ]]
[[ "$(readlink "$target/learning-note")" == "$repo_root/skills/learning-note" ]]
printf 'skill install lifecycle: OK\n'

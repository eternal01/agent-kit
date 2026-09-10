#!/usr/bin/env bash
set -euo pipefail

# 将本仓库的技能安装到通用 Agent Skills 目录。
# 可通过 AGENT_SKILLS_DIR 覆盖目标，用于测试或临时环境。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/skills"
target_dir="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"

mkdir -p "$target_dir"

for skill_dir in "$source_dir"/*; do
  [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
  skill_name="$(basename "$skill_dir")"
  target="$target_dir/$skill_name"

  rm -rf -- "$target"
  cp -R -- "$skill_dir" "$target"
  printf '已安装：%s\n' "$target"
done

printf '技能安装完成：%s\n' "$target_dir"

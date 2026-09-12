#!/usr/bin/env bash
set -euo pipefail

# 将本仓库中的技能逐个链接到通用 Agent Skills 目录。
# 默认拒绝覆盖现有目录；迁移由 build-skills.sh 创建的副本时需显式指定 --replace-copies。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/skills"
target_dir="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
replace_copies=false
dry_run=false

usage() {
  cat <<'EOF'
用法：./scripts/link-skills.sh [--replace-copies] [--dry-run]

选项：
  --replace-copies  将包含 SKILL.md 的同名普通目录替换为软链接
  --dry-run         只显示将执行的操作
  -h, --help        显示帮助

可通过 AGENT_SKILLS_DIR 覆盖默认目标 ~/.agents/skills/。
EOF
}

for arg in "$@"; do
  case "$arg" in
    --replace-copies) replace_copies=true ;;
    --dry-run) dry_run=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

mkdir -p -- "$target_dir"

# 清理只可能由本仓库留下、且源码已经删除的旧链接。
for target in "$target_dir"/*; do
  [[ -L "$target" ]] || continue
  link_target="$(readlink "$target")"
  case "$link_target" in
    "$source_dir"/*)
      if [[ ! -f "$link_target/SKILL.md" ]]; then
        if [[ "$dry_run" == true ]]; then
          printf '计划删除失效链接：%s -> %s\n' "$target" "$link_target"
        else
          rm -- "$target"
          printf '已删除失效链接：%s -> %s\n' "$target" "$link_target"
        fi
      fi
      ;;
  esac
done

# 先检查全部冲突，避免执行一半后才失败。
conflicts=0
for skill_dir in "$source_dir"/*; do
  [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
  target="$target_dir/$(basename "$skill_dir")"

  if [[ -L "$target" ]]; then
    if [[ "$(readlink "$target")" != "$skill_dir" ]]; then
      printf '冲突：%s 已链接到 %s\n' "$target" "$(readlink "$target")" >&2
      conflicts=1
    fi
  elif [[ -e "$target" ]]; then
    if [[ ! -d "$target" || ! -f "$target/SKILL.md" ]]; then
      printf '冲突：%s 不是可迁移的技能目录\n' "$target" >&2
      conflicts=1
    elif [[ "$replace_copies" != true ]]; then
      printf '冲突：%s 已存在；迁移复制副本请使用 --replace-copies\n' "$target" >&2
      conflicts=1
    fi
  fi
done

[[ "$conflicts" -eq 0 ]] || exit 1

for skill_dir in "$source_dir"/*; do
  [[ -d "$skill_dir" && -f "$skill_dir/SKILL.md" ]] || continue
  target="$target_dir/$(basename "$skill_dir")"

  if [[ -L "$target" ]]; then
    printf '已链接：%s -> %s\n' "$target" "$skill_dir"
    continue
  fi

  if [[ "$dry_run" == true ]]; then
    [[ -e "$target" ]] && action='替换副本' || action='创建链接'
    printf '计划%s：%s -> %s\n' "$action" "$target" "$skill_dir"
    continue
  fi

  [[ -e "$target" ]] && rm -rf -- "$target"
  ln -s -- "$skill_dir" "$target"
  printf '已链接：%s -> %s\n' "$target" "$skill_dir"
done

printf '技能链接完成：%s\n' "$target_dir"

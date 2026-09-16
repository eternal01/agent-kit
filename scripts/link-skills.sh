#!/usr/bin/env bash
set -euo pipefail

# 将本仓库中选定的技能逐个链接到通用 Agent Skills 目录。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/skills"
target_dir="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
source "$repo_root/scripts/skill-profiles.sh"
replace_copies=false
dry_run=false
prune=false
declare -a requested_skills=()
declare -a requested_profiles=()
declare -A selected=()

usage() {
  cat <<'EOF'
用法：./scripts/link-skills.sh [选项]

选项：
  --skill NAME            链接指定 Skill；可重复使用
  --profile NAME          链接指定 profile；可重复使用
  --list                  列出 Skill 和 profile 后退出
  --prune                 删除本仓库已管理但未选中的链接
  --replace-copies        将包含 SKILL.md 的同名普通目录替换为软链接
  --dry-run               只显示将执行的操作
  -h, --help              显示帮助

未指定 --skill 或 --profile 时链接全部 Skill。
可通过 AGENT_SKILLS_DIR 覆盖默认目标 ~/.agents/skills/。
EOF
}

list_available() {
  printf 'Skills:\n'
  find "$source_dir" -mindepth 1 -maxdepth 1 -type d -exec sh -c '[ -f "$1/SKILL.md" ] && basename "$1"' _ {} \; | sort | sed 's/^/  /'
  printf 'Profiles:\n'
  list_skill_profiles | sed 's/^/  /'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill) requested_skills+=("${2:?--skill requires a name}"); shift 2 ;;
    --profile) requested_profiles+=("${2:?--profile requires a name}"); shift 2 ;;
    --list) list_available; exit 0 ;;
    --prune) prune=true; shift ;;
    --replace-copies) replace_copies=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ${#requested_skills[@]} -eq 0 && ${#requested_profiles[@]} -eq 0 ]]; then
  while IFS= read -r name; do selected["$name"]=1; done < <(find "$source_dir" -mindepth 1 -maxdepth 1 -type d -exec sh -c '[ -f "$1/SKILL.md" ] && basename "$1"' _ {} \;)
else
  for name in "${requested_skills[@]}"; do selected["$name"]=1; done
  for profile in "${requested_profiles[@]}"; do
    if ! profile_skills "$profile" >/dev/null; then
      printf '未知 profile：%s\n' "$profile" >&2
      exit 2
    fi
    while IFS= read -r name; do selected["$name"]=1; done < <(profile_skills "$profile")
  done
fi

for name in "${!selected[@]}"; do
  if [[ ! -f "$source_dir/$name/SKILL.md" ]]; then
    printf '未知 Skill：%s\n' "$name" >&2
    exit 2
  fi
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
for name in "${!selected[@]}"; do
  skill_dir="$source_dir/$name"
  target="$target_dir/$name"
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

for name in "${!selected[@]}"; do
  skill_dir="$source_dir/$name"
  target="$target_dir/$name"
  if [[ -L "$target" ]]; then
    printf '已链接：%s -> %s\n' "$target" "$skill_dir"
  elif [[ "$dry_run" == true ]]; then
    [[ -e "$target" ]] && action='替换副本' || action='创建链接'
    printf '计划%s：%s -> %s\n' "$action" "$target" "$skill_dir"
  else
    [[ -e "$target" ]] && rm -rf -- "$target"
    ln -s -- "$skill_dir" "$target"
    printf '已链接：%s -> %s\n' "$target" "$skill_dir"
  fi
done

if [[ "$prune" == true ]]; then
  for target in "$target_dir"/*; do
    [[ -L "$target" ]] || continue
    link_target="$(readlink "$target")"
    case "$link_target" in
      "$source_dir"/*)
        name="$(basename "$target")"
        if [[ ! -v "selected[$name]" ]]; then
          if [[ "$dry_run" == true ]]; then
            printf '计划删除未选中的链接：%s -> %s\n' "$target" "$link_target"
          else
            rm -- "$target"
            printf '已删除未选中的链接：%s -> %s\n' "$target" "$link_target"
          fi
        fi
        ;;
    esac
  done
fi

printf '技能链接完成：%s\n' "$target_dir"

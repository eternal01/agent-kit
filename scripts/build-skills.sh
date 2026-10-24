#!/usr/bin/env bash
set -euo pipefail

# 将本仓库中选定的技能复制为独立快照。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/skills"
target_dir="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
source "$repo_root/scripts/skill-profiles.sh"
source "$repo_root/scripts/skill-install-common.sh"
dry_run=false
prune=false
declare -a requested_skills=()
declare -a requested_profiles=()
declare -A selected=()

usage() {
  cat <<'EOF'
用法：./scripts/build-skills.sh [选项]

选项：
  --skill NAME            构建指定 Skill；可重复使用
  --profile NAME          构建指定 profile；可重复使用
  --list                  列出 Skill 和 profile 后退出
  --prune                 删除本仓库已管理但未选中的快照或链接
  --dry-run               只显示将执行的操作
  -h, --help              显示帮助

未指定 --skill 或 --profile 时构建全部 Skill。
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
  if [[ ! "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ || ! -f "$source_dir/$name/SKILL.md" ]]; then
    printf '未知 Skill：%s\n' "$name" >&2
    exit 2
  fi
done

skill_install_init
# Validate every target before creating directories, staging, or replacing files.
for name in "${!selected[@]}"; do
  target="$target_dir/$name"
  if [[ -L "$target" ]]; then
    if [[ "$(readlink "$target")" != "$source_dir/$name" ]]; then
      printf '冲突：%s 是未知链接，拒绝替换\n' "$target" >&2
      exit 1
    fi
  elif [[ -e "$target" && ( ! -d "$target" || ! -f "$target/.agent-kit-managed" ) ]]; then
    printf '冲突：%s 不是本仓库管理的快照，拒绝替换\n' "$target" >&2
    exit 1
  fi
done

stage=""
trap 'if [[ -n "$stage" ]]; then rm -rf -- "$stage"; fi' EXIT
if [[ "$dry_run" != true ]]; then
  mkdir -p -- "$target_dir"
  stage="$(mktemp -d "$target_dir/.agent-kit-stage.XXXXXX")"
  # Finish all copies first, so a copy failure leaves existing installations intact.
  for name in "${!selected[@]}"; do
    cp -R -- "$source_dir/$name" "$stage/$name"
    : > "$stage/$name/.agent-kit-managed"
  done
fi
for name in "${!selected[@]}"; do
  target="$target_dir/$name"
  if [[ "$dry_run" == true ]]; then
    printf '计划安装（已有目标会先备份）：%s\n' "$target"
    continue
  fi
  skill_last_backup=""
  if [[ -e "$target" || -L "$target" ]]; then skill_backup_target "$target" "$name"; fi
  if ! mv -- "$stage/$name" "$target"; then
    if [[ -n "$skill_last_backup" ]]; then mv -- "$skill_last_backup" "$target"; fi
    exit 1
  fi
  printf '已安装：%s\n' "$target"
done

if [[ "$prune" == true ]]; then
  for target in "$target_dir"/*; do
    [[ -e "$target" || -L "$target" ]] || continue
    name="$(basename "$target")"
    [[ -v "selected[$name]" ]] && continue
    managed=false
    if [[ -L "$target" ]]; then
      link_target="$(readlink "$target")"
      [[ "$link_target" == "$source_dir"/* ]] && managed=true
    elif [[ -f "$target/.agent-kit-managed" ]]; then
      managed=true
    fi
    [[ "$managed" == true ]] || continue
    if [[ "$dry_run" == true ]]; then
      printf '计划删除未选中的快照：%s\n' "$target"
    else
      rm -rf -- "$target"
      printf '已删除未选中的快照：%s\n' "$target"
    fi
  done
fi

printf '技能安装完成：%s\n' "$target_dir"

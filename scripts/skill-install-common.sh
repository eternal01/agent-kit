#!/usr/bin/env bash

# Resolve prospective directories without creating them; follow existing directory
# symlinks and normalize .. before checking source/destination overlap.
skill_directory_path() {
  local path="$1" current="" part
  local -a parts=()
  [[ "$path" == /* ]] || path="$PWD/$path"
  IFS='/' read -r -a parts <<< "$path"
  for part in "${parts[@]}"; do
    case "$part" in
      ''|.) continue ;;
      ..) current="${current%/*}" ;;
      *) current="$current/$part" ;;
    esac
    [[ -n "$current" ]] || continue
    if [[ -d "$current" ]]; then
      current="$(cd -- "$current" && pwd -P)" || return 1
      [[ "$current" != / ]] || current=""
    elif [[ -e "$current" || -L "$current" ]]; then
      printf '路径不是有效目录：%s\n' "$current" >&2
      return 1
    fi
  done
  printf '%s\n' "${current:-/}"
}

skill_require_disjoint_paths() {
  local left="${1%/}/" right="${2%/}/"
  if [[ "$left" == "$right"* || "$right" == "$left"* ]]; then
    printf '拒绝重叠路径：%s 与 %s\n' "$1" "$2" >&2
    return 1
  fi
}

skill_install_init() {
  source_dir="$(skill_directory_path "$source_dir")" || return 1
  target_dir="$(skill_directory_path "$target_dir")" || return 1
  skill_require_disjoint_paths "$source_dir" "$target_dir" || return 1
  skill_backup_root="$(skill_directory_path "${AGENT_SKILLS_BACKUP_DIR:-$(dirname "$target_dir")/backups/agent-kit/skills}")" || return 1
  skill_require_disjoint_paths "$source_dir" "$skill_backup_root" || return 1
  skill_require_disjoint_paths "$target_dir" "$skill_backup_root" || return 1
  skill_backup_run=""
}

skill_backup_target() {
  local target="$1" name="$2"
  if [[ -z "$skill_backup_run" ]]; then
    mkdir -p -- "$skill_backup_root"
    skill_backup_run="$(mktemp -d "$skill_backup_root/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
  fi
  skill_last_backup="$skill_backup_run/$name"
  mv -- "$target" "$skill_last_backup"
  printf '已备份：%s -> %s\n' "$target" "$skill_last_backup"
}

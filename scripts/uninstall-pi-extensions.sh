#!/usr/bin/env bash
set -euo pipefail

# 仅卸载由本仓库链接或带管理标记的 Pi extensions，可选恢复最近备份。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/adapters/pi/extensions"
target_dir="${PI_EXTENSIONS_DIR:-$HOME/.pi/agent/extensions}"
# shellcheck source=./pi-extension-common.sh
source "$repo_root/scripts/pi-extension-common.sh"
pi_extension_init_backup
restore_latest=false
dry_run=false

usage() {
  cat <<'EOF'
用法：./scripts/uninstall-pi-extensions.sh [--restore-latest] [--dry-run]

选项：
  --restore-latest  卸载后恢复各扩展最近一次备份
  --dry-run         只显示将执行的操作
  -h, --help        显示帮助

脚本不会删除未知链接或没有 .agent-kit-managed 标记的普通目录。
可通过 PI_EXTENSIONS_DIR 和 PI_EXTENSIONS_BACKUP_DIR 覆盖目标与备份目录。
EOF
}

for arg in "$@"; do
  case "$arg" in
    --restore-latest) restore_latest=true ;;
    --dry-run) dry_run=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
  extension_name="$(basename "$extension_dir")"
  target="$target_dir/$extension_name"
  managed=false

  if [[ -L "$target" && "$(readlink "$target")" == "$extension_dir" ]]; then
    managed=true
  elif [[ -d "$target" && -f "$target/.agent-kit-managed" ]] \
    && [[ "$(head -n 1 "$target/.agent-kit-managed")" == "$extension_dir" ]]; then
    managed=true
  elif [[ -e "$target" || -L "$target" ]]; then
    printf '跳过未知目标：%s\n' "$target" >&2
  fi

  if [[ "$managed" == true ]]; then
    if [[ "$dry_run" == true ]]; then
      printf '计划卸载：%s\n' "$target"
    else
      rm -rf -- "$target"
      printf '已卸载：%s\n' "$target"
    fi
  fi

  if [[ "$restore_latest" == true && ( "$managed" == true || ( ! -e "$target" && ! -L "$target" ) ) ]]; then
    latest="$(pi_extension_latest_backup "$extension_name" || true)"
    if [[ -n "$latest" ]]; then
      if [[ "$dry_run" == true ]]; then
        printf '计划恢复：%s -> %s\n' "$latest" "$target"
      else
        mkdir -p -- "$target_dir"
        mv -- "$latest" "$target"
        printf '已恢复：%s -> %s\n' "$latest" "$target"
      fi
    fi
  fi
done

printf 'Pi extensions 卸载流程完成：%s\n' "$target_dir"

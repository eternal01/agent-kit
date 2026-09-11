#!/usr/bin/env bash
set -euo pipefail

# 将本仓库中的 Pi extensions 逐个链接到 Pi 的全局扩展目录。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/adapters/pi/extensions"
target_dir="${PI_EXTENSIONS_DIR:-$HOME/.pi/agent/extensions}"
replace_copies=false
dry_run=false

usage() {
  cat <<'EOF'
用法：./scripts/link-pi-extensions.sh [--replace-copies] [--dry-run]

选项：
  --replace-copies  将包含 index.ts 的同名普通目录替换为软链接
  --dry-run         只显示将执行的操作
  -h, --help        显示帮助

可通过 PI_EXTENSIONS_DIR 覆盖默认目标 ~/.pi/agent/extensions/。
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

conflicts=0
for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
  target="$target_dir/$(basename "$extension_dir")"

  if [[ -L "$target" ]]; then
    if [[ "$(readlink "$target")" != "$extension_dir" ]]; then
      printf '冲突：%s 已链接到 %s\n' "$target" "$(readlink "$target")" >&2
      conflicts=1
    fi
  elif [[ -e "$target" ]]; then
    if [[ ! -d "$target" || ! -f "$target/index.ts" ]]; then
      printf '冲突：%s 不是可迁移的扩展目录\n' "$target" >&2
      conflicts=1
    elif [[ "$replace_copies" != true ]]; then
      printf '冲突：%s 已存在；迁移复制副本请使用 --replace-copies\n' "$target" >&2
      conflicts=1
    fi
  fi
done

[[ "$conflicts" -eq 0 ]] || exit 1

if [[ "$dry_run" != true ]]; then
  mkdir -p -- "$target_dir"
fi

for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
  target="$target_dir/$(basename "$extension_dir")"

  if [[ -L "$target" ]]; then
    printf '已链接：%s -> %s\n' "$target" "$extension_dir"
    continue
  fi

  if [[ "$dry_run" == true ]]; then
    [[ -e "$target" ]] && action='替换副本' || action='创建链接'
    printf '计划%s：%s -> %s\n' "$action" "$target" "$extension_dir"
    continue
  fi

  [[ -e "$target" ]] && rm -rf -- "$target"
  ln -s -- "$extension_dir" "$target"
  printf '已链接：%s -> %s\n' "$target" "$extension_dir"
done

printf 'Pi extensions 链接完成：%s\n' "$target_dir"

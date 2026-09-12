#!/usr/bin/env bash
set -euo pipefail

# 将本仓库中的 Pi extensions 复制为稳定快照。
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/adapters/pi/extensions"
target_dir="${PI_EXTENSIONS_DIR:-$HOME/.pi/agent/extensions}"
# shellcheck source=./pi-extension-common.sh
source "$repo_root/scripts/pi-extension-common.sh"
pi_extension_init_backup

mkdir -p -- "$target_dir"

conflicts=0
for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
  extension_name="$(basename "$extension_dir")"
  target="$target_dir/$extension_name"

  if [[ -L "$target" ]]; then
    if [[ "$(readlink "$target")" != "$extension_dir" ]]; then
      printf '冲突：%s 已链接到其他位置\n' "$target" >&2
      conflicts=1
    fi
  elif [[ -e "$target" && ( ! -d "$target" || ! -f "$target/index.ts" ) ]]; then
    printf '冲突：%s 不是可替换的扩展目录\n' "$target" >&2
    conflicts=1
  fi
done

[[ "$conflicts" -eq 0 ]] || exit 1

for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
  extension_name="$(basename "$extension_dir")"
  target="$target_dir/$extension_name"

  if [[ -L "$target" ]]; then
    rm -- "$target"
  elif [[ -e "$target" ]]; then
    pi_extension_backup "$target" "$extension_name"
  fi

  mkdir -p -- "$target"
  tar -C "$extension_dir" --exclude='./node_modules' --exclude='./.git' -cf - . | tar -C "$target" -xf -
  printf '%s\n' "$extension_dir" > "$target/.agent-kit-managed"
  printf '已安装：%s\n' "$target"
done

printf 'Pi extensions 安装完成：%s\n' "$target_dir"

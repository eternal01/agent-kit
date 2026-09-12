#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/adapters/pi/extensions"
failures=0

for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" ]] || continue
  name="$(basename "$extension_dir")"
  if [[ ! -f "$extension_dir/index.ts" ]]; then
    printf '缺少扩展入口：%s/index.ts\n' "$extension_dir" >&2
    failures=$((failures + 1))
    continue
  fi

  matches="$(grep -RInE --include='*.ts' --exclude-dir=node_modules \
      "from[[:space:]]+[\"'](\\.\\./){2,}" "$extension_dir" 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    printf '扩展跨越自身目录导入：%s\n%s\n' "$name" "$matches" >&2
    failures=$((failures + 1))
  fi

  matches="$(grep -RInE --exclude-dir=node_modules --exclude='package-lock.json' \
      '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})' \
      "$extension_dir" 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    printf '扩展中疑似包含凭据：%s\n%s\n' "$name" "$matches" >&2
    failures=$((failures + 1))
  fi

  if [[ -f "$extension_dir/package.json" ]]; then
    node -e '
      const p=require(process.argv[1]);
      if (!Array.isArray(p.pi?.extensions) || p.pi.extensions.length === 0) process.exit(1)
    ' "$extension_dir/package.json" || {
      printf 'package.json 缺少 pi.extensions：%s\n' "$name" >&2
      failures=$((failures + 1))
    }
    [[ -f "$extension_dir/package-lock.json" ]] || {
      printf 'package.json 缺少锁文件：%s\n' "$name" >&2
      failures=$((failures + 1))
    }
  fi
done

[[ "$failures" -eq 0 ]] || exit 1
printf 'Pi extension boundaries: OK\n'

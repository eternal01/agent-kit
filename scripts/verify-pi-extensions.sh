#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/adapters/pi/extensions"
live=false

usage() {
  cat <<'EOF'
用法：./scripts/verify-pi-extensions.sh [--live]

默认执行边界检查、Shell 语法检查、安装生命周期测试，以及各扩展声明的 verify。
--live 另外检查 gh 认证、GitHub API 和 Pi 扩展实际加载。
EOF
}

for arg in "$@"; do
  case "$arg" in
    --live) live=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

"$repo_root/scripts/check-pi-extension-boundaries.sh"

while IFS= read -r script; do
  bash -n "$script"
done < <(find "$repo_root/scripts" "$repo_root/tests/scripts" -type f -name '*.sh' | sort)
printf 'Shell syntax: OK\n'

bash "$repo_root/tests/scripts/pi-extension-install.test.sh"
bash "$repo_root/tests/scripts/skill-install.test.sh"
node --test "$repo_root/tests/skills/validate-skills.test.mjs" "$repo_root/tests/skills/replay-skill-triggers.test.mjs" "$repo_root/tests/scripts/check-docs.test.mjs" "$repo_root/tests/benchmarks/validate-minimal-change-benchmarks.test.mjs" "$repo_root/tests/benchmarks/validate-skill-evals.test.mjs"
"$repo_root/scripts/validate-skills.mjs" "$repo_root/skills"
"$repo_root/scripts/validate-minimal-change-benchmarks.mjs"
node "$repo_root/scripts/validate-skill-evals.mjs"
"$repo_root/scripts/check-docs.mjs" "$repo_root"

for extension_dir in "$source_dir"/*; do
  [[ -d "$extension_dir" && -f "$extension_dir/package.json" ]] || continue
  if [[ ! -d "$extension_dir/node_modules" ]]; then
    printf '缺少依赖：%s；请先在该目录执行 npm ci\n' "$extension_dir" >&2
    exit 1
  fi
  printf '验证扩展：%s\n' "$(basename "$extension_dir")"
  (cd "$extension_dir" && npm run verify --if-present)
done

if [[ "$live" == true ]]; then
  command -v gh >/dev/null || { printf '未找到 gh\n' >&2; exit 1; }
  command -v pi >/dev/null || { printf '未找到 pi\n' >&2; exit 1; }
  gh auth status --hostname github.com >/dev/null
  gh api rate_limit --jq '.resources | {core,search}' >/dev/null
  for extension_dir in "$source_dir"/*; do
    [[ -d "$extension_dir" && -f "$extension_dir/index.ts" ]] || continue
    pi -e "$extension_dir/index.ts" --list-models >/dev/null
  done
  printf 'Live gh/Pi checks: OK\n'
fi

printf 'Pi extensions verification: OK\n'

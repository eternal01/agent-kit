#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

# Dry-run must not replace or back up existing content.
dry_target="$tmp/dry/extensions"
dry_backup="$tmp/dry/backups"
mkdir -p "$dry_target/github-research"
printf 'keep me\n' > "$dry_target/github-research/index.ts"
PI_EXTENSIONS_DIR="$dry_target" PI_EXTENSIONS_BACKUP_DIR="$dry_backup" \
  "$repo_root/scripts/link-pi-extensions.sh" --replace-copies --dry-run >/dev/null
[[ ! -L "$dry_target/github-research" ]]
grep -qx 'keep me' "$dry_target/github-research/index.ts"
[[ ! -e "$dry_backup" ]]

# Replacing a copied extension must preserve it, and uninstall --restore-latest must restore it.
target="$tmp/linked/extensions"
backup="$tmp/linked/backups"
mkdir -p "$target/github-research"
printf 'old extension\n' > "$target/github-research/index.ts"
PI_EXTENSIONS_DIR="$target" PI_EXTENSIONS_BACKUP_DIR="$backup" \
  "$repo_root/scripts/link-pi-extensions.sh" --replace-copies >/dev/null
[[ -L "$target/github-research" ]]
find "$backup" -type f -path '*/github-research/index.ts' -exec grep -qx 'old extension' {} \;
PI_EXTENSIONS_DIR="$target" PI_EXTENSIONS_BACKUP_DIR="$backup" \
  "$repo_root/scripts/uninstall-pi-extensions.sh" --restore-latest >/dev/null
[[ -d "$target/github-research" && ! -L "$target/github-research" ]]
grep -qx 'old extension' "$target/github-research/index.ts"

# Snapshot installs must be marked as managed, exclude node_modules, and be safely removable.
snapshot="$tmp/snapshot/extensions"
snapshot_backup="$tmp/snapshot/backups"
PI_EXTENSIONS_DIR="$snapshot" PI_EXTENSIONS_BACKUP_DIR="$snapshot_backup" \
  "$repo_root/scripts/build-pi-extensions.sh" >/dev/null
[[ -f "$snapshot/github-research/.agent-kit-managed" ]]
[[ ! -e "$snapshot/github-research/node_modules" ]]
PI_EXTENSIONS_DIR="$snapshot" PI_EXTENSIONS_BACKUP_DIR="$snapshot_backup" \
  "$repo_root/scripts/uninstall-pi-extensions.sh" >/dev/null
[[ ! -e "$snapshot/github-research" ]]

# Unknown directories must survive uninstall.
mkdir -p "$snapshot/github-research"
printf 'unknown\n' > "$snapshot/github-research/index.ts"
PI_EXTENSIONS_DIR="$snapshot" PI_EXTENSIONS_BACKUP_DIR="$snapshot_backup" \
  "$repo_root/scripts/uninstall-pi-extensions.sh" >/dev/null 2>&1
[[ -f "$snapshot/github-research/index.ts" ]]

printf 'pi extension install lifecycle: OK\n'

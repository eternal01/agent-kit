#!/usr/bin/env bash

pi_extension_init_backup() {
  backup_root="${PI_EXTENSIONS_BACKUP_DIR:-$(dirname "$target_dir")/backups/agent-kit/pi-extensions}"
  backup_run_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  backup_initialized=false
}

pi_extension_backup() {
  local target="$1"
  local name="$2"
  if [[ "$backup_initialized" != true ]]; then
    mkdir -p -- "$backup_run_dir"
    backup_initialized=true
  fi
  mv -- "$target" "$backup_run_dir/$name"
  printf '已备份：%s -> %s\n' "$target" "$backup_run_dir/$name"
}

pi_extension_latest_backup() {
  local name="$1"
  local candidate latest=""
  [[ -d "$backup_root" ]] || return 1
  for candidate in "$backup_root"/*/"$name"; do
    [[ -e "$candidate" || -L "$candidate" ]] || continue
    latest="$candidate"
  done
  [[ -n "$latest" ]] || return 1
  printf '%s\n' "$latest"
}

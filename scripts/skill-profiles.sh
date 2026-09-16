#!/usr/bin/env bash
# 供 Skill 安装脚本加载的稳定 profile 定义。

declare -Ar SKILL_PROFILES=(
  [architecture]='architecture-decision implementation-planning system-architecture technology-selection'
  [core-development]='code-review codebase-onboarding software-implementation solution-design systematic-debugging'
  [governance]='coding-standards grilling security-assessment skill-authoring'
  [knowledge]='learning-note technical-documentation web-research'
)

list_skill_profiles() {
  printf '%s\n' "${!SKILL_PROFILES[@]}" | sort
}

profile_skills() {
  local profile="$1"
  [[ -v "SKILL_PROFILES[$profile]" ]] || return 1
  printf '%s\n' ${SKILL_PROFILES[$profile]}
}

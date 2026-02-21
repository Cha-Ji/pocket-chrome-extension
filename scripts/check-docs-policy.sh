#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail=0

echo "[docs-policy] 1/3 archive 밖 3-file 금지"
mapfile -t legacy_files < <(find . -type f \( -name 'task_plan.md' -o -name 'findings.md' -o -name 'progress.md' \) \
  -not -path './docs/archive/*' \
  -not -path './node_modules/*' \
  -not -path './.git/*' \
  | sort)

if ((${#legacy_files[@]} > 0)); then
  echo "[docs-policy] FAIL: archive 밖에서 3-file이 발견되었습니다."
  printf '  - %s\n' "${legacy_files[@]}"
  fail=1
else
  echo "[docs-policy] PASS"
fi

echo "[docs-policy] 2/3 docs/3-file 경로 참조 금지"
forbidden_refs="$(rg -n 'docs/(task_plan|findings|progress)\.md' \
  --glob '!docs/archive/**' \
  --glob '!node_modules/**' \
  --glob '!.git/**' \
  --glob '!scripts/check-docs-policy.sh' \
  || true)"

if [[ -n "$forbidden_refs" ]]; then
  echo "[docs-policy] FAIL: 금지된 docs/3-file 경로 참조가 남아있습니다."
  echo "$forbidden_refs"
  fail=1
else
  echo "[docs-policy] PASS"
fi

echo "[docs-policy] 3/3 local/global 3-file skill 동기화"
local_skill="$ROOT_DIR/.agents/skills/3-file-pattern/SKILL.md"
local_tpl="$ROOT_DIR/.agents/skills/3-file-pattern/references/file-templates.md"
global_base="${HOME:-/home/chaji}/.agents/skills/3-file-pattern"
global_skill="$global_base/SKILL.md"
global_tpl="$global_base/references/file-templates.md"

for required_file in "$local_skill" "$local_tpl" "$global_skill" "$global_tpl"; do
  if [[ ! -f "$required_file" ]]; then
    echo "[docs-policy] FAIL: 파일이 없습니다: $required_file"
    fail=1
  fi
done

if ((fail == 0)); then
  local_skill_hash="$(sha256sum "$local_skill" | awk '{print $1}')"
  global_skill_hash="$(sha256sum "$global_skill" | awk '{print $1}')"
  local_tpl_hash="$(sha256sum "$local_tpl" | awk '{print $1}')"
  global_tpl_hash="$(sha256sum "$global_tpl" | awk '{print $1}')"

  if [[ "$local_skill_hash" != "$global_skill_hash" ]]; then
    echo "[docs-policy] FAIL: SKILL.md가 local/global 간 불일치합니다."
    echo "  local : $local_skill_hash"
    echo "  global: $global_skill_hash"
    fail=1
  fi

  if [[ "$local_tpl_hash" != "$global_tpl_hash" ]]; then
    echo "[docs-policy] FAIL: file-templates.md가 local/global 간 불일치합니다."
    echo "  local : $local_tpl_hash"
    echo "  global: $global_tpl_hash"
    fail=1
  fi
fi

if ((fail != 0)); then
  echo "[docs-policy] FAILED"
  exit 1
fi

echo "[docs-policy] PASSED"

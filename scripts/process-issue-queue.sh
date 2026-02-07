#!/usr/bin/env bash
#
# Issue Queue 처리 스크립트
#
# 사용법:
#   ./scripts/process-issue-queue.sh          # 전체 처리
#   ./scripts/process-issue-queue.sh --dry-run # 미리보기 (실제 생성 안함)
#
# 전제조건:
#   - gh CLI 인증 완료 (gh auth login)
#   - git 작업 디렉토리가 clean 상태
#
# 이 스크립트는 LLM이 직접 실행하거나, LLM에게 참고 자료로 제공됩니다.

set -euo pipefail

QUEUE_DIR="docs/issue-queue"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false
PROCESSED=0
FAILED=0

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}[DRY-RUN] 미리보기 모드 - 실제 이슈 생성 안함${NC}"
fi

cd "$PROJECT_ROOT"

# gh CLI 확인
if ! command -v gh &> /dev/null; then
  echo -e "${RED}ERROR: gh CLI가 설치되지 않았습니다.${NC}"
  echo "  설치: https://cli.github.com/"
  exit 1
fi

# gh 인증 확인
if ! gh auth status &> /dev/null 2>&1; then
  echo -e "${RED}ERROR: gh CLI 인증이 필요합니다.${NC}"
  echo "  실행: gh auth login"
  exit 1
fi

# 큐 폴더 확인
if [[ ! -d "$QUEUE_DIR" ]]; then
  echo -e "${RED}ERROR: $QUEUE_DIR 폴더가 없습니다.${NC}"
  exit 1
fi

# 이슈 파일 수집 (우선순위 순 정렬: p0 → p3)
mapfile -t ISSUE_FILES < <(
  find "$QUEUE_DIR" -maxdepth 1 -name "p[0-3]-*.md" -type f | sort
)

if [[ ${#ISSUE_FILES[@]} -eq 0 ]]; then
  echo -e "${GREEN}처리할 이슈가 없습니다.${NC}"
  exit 0
fi

echo "========================================="
echo " Issue Queue 처리: ${#ISSUE_FILES[@]}건"
echo "========================================="

# frontmatter에서 값 추출 헬퍼
parse_frontmatter() {
  local file="$1"
  local key="$2"
  # YAML frontmatter에서 key: value 추출
  sed -n '/^---$/,/^---$/p' "$file" | grep "^${key}:" | sed "s/^${key}: *//" | sed 's/^"\(.*\)"$/\1/' | head -1
}

# labels 배열 파싱
parse_labels() {
  local file="$1"
  sed -n '/^---$/,/^---$/p' "$file" | grep "^labels:" | sed 's/^labels: *\[//' | sed 's/\]//' | sed 's/"//g' | sed 's/, */,/g'
}

# frontmatter 이후 본문 추출
parse_body() {
  local file="$1"
  # 두 번째 --- 이후의 내용
  awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$file"
}

# priority → label 매핑
priority_label() {
  case "$1" in
    p0) echo "priority: critical" ;;
    p1) echo "priority: high" ;;
    p2) echo "priority: medium" ;;
    p3) echo "priority: low" ;;
    *)  echo "" ;;
  esac
}

for file in "${ISSUE_FILES[@]}"; do
  filename=$(basename "$file")
  echo ""
  echo "-----------------------------------------"
  echo "처리: $filename"
  echo "-----------------------------------------"

  # frontmatter 파싱
  title=$(parse_frontmatter "$file" "title")
  type=$(parse_frontmatter "$file" "type")
  priority=$(parse_frontmatter "$file" "priority")
  labels_raw=$(parse_labels "$file")
  body=$(parse_body "$file")

  if [[ -z "$title" ]]; then
    echo -e "${RED}  SKIP: title이 비어있음${NC}"
    FAILED=$((FAILED + 1))
    continue
  fi

  # priority label 추가
  plabel=$(priority_label "$priority")
  if [[ -n "$plabel" && -n "$labels_raw" ]]; then
    labels_raw="${labels_raw},${plabel}"
  elif [[ -n "$plabel" ]]; then
    labels_raw="$plabel"
  fi

  echo "  제목: $title"
  echo "  유형: $type"
  echo "  우선순위: $priority"
  echo "  라벨: $labels_raw"

  if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  [DRY-RUN] 이슈 생성 스킵${NC}"
    PROCESSED=$((PROCESSED + 1))
    continue
  fi

  # GitHub Issue 생성
  label_args=""
  IFS=',' read -ra LABEL_ARRAY <<< "$labels_raw"
  for label in "${LABEL_ARRAY[@]}"; do
    label=$(echo "$label" | xargs)  # trim
    if [[ -n "$label" ]]; then
      label_args="$label_args --label \"$label\""
    fi
  done

  issue_url=$(eval gh issue create \
    --title "\"$title\"" \
    $label_args \
    --body "\"$body\"" 2>&1) || {
    echo -e "${RED}  ERROR: 이슈 생성 실패${NC}"
    echo "  $issue_url"
    FAILED=$((FAILED + 1))
    continue
  }

  echo -e "${GREEN}  생성됨: $issue_url${NC}"

  # 파일 삭제 및 커밋
  git rm "$file"
  git commit -m "[-][issue-queue] 이슈 생성 완료: $title

* 이슈 URL: $issue_url
* 원본 파일: $filename"

  PROCESSED=$((PROCESSED + 1))
done

echo ""
echo "========================================="
echo " 결과: 성공 ${PROCESSED}건 / 실패 ${FAILED}건"
echo "========================================="

if [[ "$DRY_RUN" == false && $PROCESSED -gt 0 ]]; then
  echo ""
  echo "git push를 실행하시겠습니까? (y/N)"
  read -r answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    git push
    echo -e "${GREEN}푸시 완료${NC}"
  else
    echo "푸시를 건너뛰었습니다. 수동으로 git push 해주세요."
  fi
fi

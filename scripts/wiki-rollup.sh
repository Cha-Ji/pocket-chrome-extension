#!/usr/bin/env bash
#
# Wiki Worklog Rollup Utility
#
# Daily note -> Weekly archive after 7 days
# Weekly note -> Monthly archive after 1 month
#
# Usage:
#   ./scripts/wiki-rollup.sh scaffold
#   ./scripts/wiki-rollup.sh daily [YYYY-MM-DD]
#   ./scripts/wiki-rollup.sh weekly
#   ./scripts/wiki-rollup.sh monthly
#   ./scripts/wiki-rollup.sh run
#   ./scripts/wiki-rollup.sh --dry-run run
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WIKI_DIR="${WIKI_DIR:-$REPO_ROOT/../pocket-chrome-extension.wiki}"

WORKLOG_DIR="$WIKI_DIR/Worklog"
TEMPLATE_DIR="$WORKLOG_DIR/_templates"
DAILY_DIR="$WORKLOG_DIR/Daily"
WEEKLY_DIR="$WORKLOG_DIR/Weekly"
MONTHLY_DIR="$WORKLOG_DIR/Monthly"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

COMMAND="${1:-run}"
TARGET_DATE="${2:-$(date +%F)}"
TODAY="$(date +%F)"

log() {
  echo "[wiki-rollup] $*"
}

run_or_echo() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

ensure_wiki_repo() {
  if [[ ! -d "$WIKI_DIR" ]]; then
    echo "ERROR: Wiki directory not found: $WIKI_DIR"
    echo "Hint: export WIKI_DIR=/path/to/pocket-chrome-extension.wiki"
    exit 1
  fi
}

ensure_scaffold() {
  run_or_echo "mkdir -p \"$TEMPLATE_DIR\" \"$DAILY_DIR\" \"$WEEKLY_DIR\" \"$MONTHLY_DIR\" \"$DAILY_DIR/archive\" \"$WEEKLY_DIR/archive\""

  if [[ ! -f "$WORKLOG_DIR/README.md" ]]; then
    run_or_echo "cat > \"$WORKLOG_DIR/README.md\" <<'EOF'
# Worklog

운영 원칙:
- Daily 기록은 7일이 지나면 Weekly로 롤업 후 `Daily/archive/`로 이동
- Weekly 기록은 1개월이 지나면 Monthly로 롤업 후 `Weekly/archive/`로 이동
- 현재 상태는 `docs/BOARD.md`에서 관리하고, 회고/이력은 Worklog에 누적

자동화:
- `npm run wiki:daily` : 오늘 Daily 파일 생성
- `npm run wiki:rollup:weekly` : Daily -> Weekly 롤업
- `npm run wiki:rollup:monthly` : Weekly -> Monthly 롤업
- `npm run wiki:rollup` : 전체 롤업 실행
EOF"
  fi

  if [[ ! -f "$TEMPLATE_DIR/daily.md" ]]; then
    run_or_echo "cat > \"$TEMPLATE_DIR/daily.md\" <<'EOF'
# Daily Worklog - {{DATE}}

## Snapshot
- Date: {{DATE}}
- Owner:
- Branch:
- Primary Issue:

## Highlights
- 

## Git Activity
### Commits
- 

### Pull Requests
- 

### Issues
- 

## Decisions
- 

## Risks / Blockers
- 

## Next Actions
- 

## References
- docs/BOARD.md
EOF"
  fi

  if [[ ! -f "$TEMPLATE_DIR/weekly.md" ]]; then
    run_or_echo "cat > \"$TEMPLATE_DIR/weekly.md\" <<'EOF'
# Weekly Worklog - {{WEEK_KEY}}

## Snapshot
- Week: {{WEEK_KEY}}
- Week Start: {{WEEK_START}}
- Week End: {{WEEK_END}}

## Weekly Summary
- 

## Daily Rollups

## Carry-over / Blockers
- 

## Next Week Focus
- 
EOF"
  fi

  if [[ ! -f "$TEMPLATE_DIR/monthly.md" ]]; then
    run_or_echo "cat > \"$TEMPLATE_DIR/monthly.md\" <<'EOF'
# Monthly Worklog - {{MONTH_KEY}}

## Snapshot
- Month: {{MONTH_KEY}}
- Start: {{MONTH_START}}
- End: {{MONTH_END}}

## Monthly Summary
- 

## Weekly Rollups

## Major Decisions
- 

## Next Month Focus
- 
EOF"
  fi
}

create_daily() {
  local date_str="$1"
  local year
  local daily_file

  year="$(date -d "$date_str" +%Y)"
  daily_file="$DAILY_DIR/$year/$date_str.md"

  run_or_echo "mkdir -p \"$DAILY_DIR/$year\""

  if [[ -f "$daily_file" ]]; then
    log "Daily already exists: $daily_file"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] create $daily_file"
    return 0
  fi

  sed \
    -e "s/{{DATE}}/$date_str/g" \
    "$TEMPLATE_DIR/daily.md" > "$daily_file"

  log "Created Daily: $daily_file"
}

week_start_for_date() {
  local date_str="$1"
  local dow
  dow="$(date -d "$date_str" +%u)" # 1=Mon..7=Sun
  date -d "$date_str -$((dow - 1)) days" +%F
}

week_end_for_start() {
  local week_start="$1"
  date -d "$week_start +6 days" +%F
}

week_key_for_start() {
  local week_start="$1"
  printf "%s-W%s" "$(date -d "$week_start" +%G)" "$(date -d "$week_start" +%V)"
}

ensure_weekly_file() {
  local week_key="$1"
  local week_start="$2"
  local week_end="$3"
  local week_year
  local weekly_file

  week_year="${week_key%%-W*}"
  weekly_file="$WEEKLY_DIR/$week_year/$week_key.md"
  run_or_echo "mkdir -p \"$WEEKLY_DIR/$week_year\""

  if [[ -f "$weekly_file" ]]; then
    echo "$weekly_file"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "$weekly_file"
    return 0
  fi

  sed \
    -e "s/{{WEEK_KEY}}/$week_key/g" \
    -e "s/{{WEEK_START}}/$week_start/g" \
    -e "s/{{WEEK_END}}/$week_end/g" \
    "$TEMPLATE_DIR/weekly.md" > "$weekly_file"

  echo "$weekly_file"
}

ensure_monthly_file() {
  local month_key="$1"
  local month_start="$2"
  local month_end="$3"
  local month_year
  local monthly_file

  month_year="${month_key%%-*}"
  monthly_file="$MONTHLY_DIR/$month_year/$month_key.md"
  run_or_echo "mkdir -p \"$MONTHLY_DIR/$month_year\""

  if [[ -f "$monthly_file" ]]; then
    echo "$monthly_file"
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "$monthly_file"
    return 0
  fi

  sed \
    -e "s/{{MONTH_KEY}}/$month_key/g" \
    -e "s/{{MONTH_START}}/$month_start/g" \
    -e "s/{{MONTH_END}}/$month_end/g" \
    "$TEMPLATE_DIR/monthly.md" > "$monthly_file"

  echo "$monthly_file"
}

rollup_daily_to_weekly() {
  local cutoff
  cutoff="$(date -d "$TODAY -7 days" +%F)"
  log "Daily cutoff: $cutoff (<= this date will be rolled up)"

  while IFS= read -r daily_file; do
    local date_key
    local year
    local week_start
    local week_end
    local week_key
    local weekly_file
    local marker
    local archive_dir
    local archived_daily_page

    date_key="$(basename "$daily_file" .md)"
    if [[ "$date_key" > "$cutoff" ]]; then
      continue
    fi

    year="$(date -d "$date_key" +%Y)"
    week_start="$(week_start_for_date "$date_key")"
    week_end="$(week_end_for_start "$week_start")"
    week_key="$(week_key_for_start "$week_start")"
    weekly_file="$(ensure_weekly_file "$week_key" "$week_start" "$week_end")"
    marker="<!-- source-daily:$date_key -->"
    archived_daily_page="Worklog/Daily/archive/$year/$date_key"

    if [[ -f "$weekly_file" ]] && grep -qF "$marker" "$weekly_file"; then
      log "Already rolled up: $date_key -> $week_key"
    else
      log "Rollup Daily -> Weekly: $date_key -> $week_key"

      if [[ "$DRY_RUN" == true ]]; then
        echo "[dry-run] append $daily_file to $weekly_file"
      else
        {
          echo
          echo "### $date_key"
          echo "$marker"
          echo "- Source: [[${archived_daily_page}]]"
          echo
          echo "<details><summary>Daily Snapshot</summary>"
          echo
          sed 's/^/> /' "$daily_file"
          echo
          echo "</details>"
        } >> "$weekly_file"
      fi
    fi

    archive_dir="$DAILY_DIR/archive/$year"
    run_or_echo "mkdir -p \"$archive_dir\""
    run_or_echo "mv \"$daily_file\" \"$archive_dir/$date_key.md\""
  done < <(find "$DAILY_DIR" -mindepth 2 -maxdepth 2 -type f -name "????-??-??.md" | sort)
}

rollup_weekly_to_monthly() {
  local cutoff
  cutoff="$(date -d "$TODAY -1 month" +%F)"
  log "Weekly cutoff: $cutoff (week end <= this date will be rolled up)"

  while IFS= read -r weekly_file; do
    local week_key
    local week_year
    local week_end
    local month_key
    local month_start
    local month_end
    local monthly_file
    local marker
    local archive_dir
    local archived_weekly_page

    week_key="$(basename "$weekly_file" .md)"
    week_year="$(basename "$(dirname "$weekly_file")")"
    week_end="$(sed -n 's/^- Week End: \([0-9-]\{10\}\)$/\1/p' "$weekly_file" | head -1)"

    if [[ -z "$week_end" ]]; then
      log "Skip weekly (no Week End metadata): $weekly_file"
      continue
    fi

    if [[ "$week_end" > "$cutoff" ]]; then
      continue
    fi

    month_key="$(date -d "$week_end" +%Y-%m)"
    month_start="$(date -d "$month_key-01" +%F)"
    month_end="$(date -d "$month_start +1 month -1 day" +%F)"
    monthly_file="$(ensure_monthly_file "$month_key" "$month_start" "$month_end")"
    marker="<!-- source-weekly:$week_key -->"
    archived_weekly_page="Worklog/Weekly/archive/$week_year/$week_key"

    if [[ -f "$monthly_file" ]] && grep -qF "$marker" "$monthly_file"; then
      log "Already rolled up: $week_key -> $month_key"
    else
      log "Rollup Weekly -> Monthly: $week_key -> $month_key"

      if [[ "$DRY_RUN" == true ]]; then
        echo "[dry-run] append $weekly_file to $monthly_file"
      else
        {
          echo
          echo "## $week_key"
          echo "$marker"
          echo "- Source: [[${archived_weekly_page}]]"
          echo
          echo "<details><summary>Weekly Snapshot</summary>"
          echo
          sed 's/^/> /' "$weekly_file"
          echo
          echo "</details>"
        } >> "$monthly_file"
      fi
    fi

    archive_dir="$WEEKLY_DIR/archive/$week_year"
    run_or_echo "mkdir -p \"$archive_dir\""
    run_or_echo "mv \"$weekly_file\" \"$archive_dir/$week_key.md\""
  done < <(find "$WEEKLY_DIR" -mindepth 2 -maxdepth 2 -type f -name "????-W??.md" | sort)
}

ensure_scaffold

case "$COMMAND" in
  scaffold)
    log "Scaffold complete: $WORKLOG_DIR"
    ;;
  daily)
    create_daily "$TARGET_DATE"
    ;;
  weekly)
    rollup_daily_to_weekly
    ;;
  monthly)
    rollup_weekly_to_monthly
    ;;
  run)
    create_daily "$TODAY"
    rollup_daily_to_weekly
    rollup_weekly_to_monthly
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Usage: $0 [--dry-run] {scaffold|daily|weekly|monthly|run} [YYYY-MM-DD]"
    exit 1
    ;;
esac


#!/bin/bash
# N개 인스턴스를 병렬로 실행하는 오케스트레이터
#
# 각 인스턴스는 독립 Xvfb 디스플레이 + 독립 Chrome 프로필을 사용하며,
# 자산을 모듈로 기반으로 파티셔닝하여 중복 수집을 방지합니다.
#
# 사전 요건:
#   1. 수집 서버 실행: npm run collector
#   2. 각 프로필에 PO 로그인 완료:
#      for i in $(seq 0 $((N-1))); do
#        PROFILE_DIR=~/.pocket-quant/chrome-profile-$i npm run collect:visible
#      done
#
# 사용법:
#   scripts/parallel-collect.sh [N]       # N개 인스턴스 (기본: 3)
#   scripts/parallel-collect.sh 2         # 2개 인스턴스
#   MIN_PAYOUT=60 scripts/parallel-collect.sh 4

set -euo pipefail

NUM=${1:-3}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_BASE="${HOME}/.pocket-quant"
PIDS=()
BASE_DISPLAY=99

# 환경변수 기본값 (외부에서 override 가능)
: "${MIN_PAYOUT:=50}"
: "${ONLY_OTC:=false}"
: "${OFFSET:=300000}"
: "${MAX_DAYS:=90}"
: "${REQUEST_DELAY:=200}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 병렬 수집 시작: ${NUM}개 인스턴스 ==="
echo "  MIN_PAYOUT=${MIN_PAYOUT}, ONLY_OTC=${ONLY_OTC}"
echo "  OFFSET=${OFFSET}, MAX_DAYS=${MAX_DAYS}, REQUEST_DELAY=${REQUEST_DELAY}"
echo ""

# ── Xvfb 설치 확인 ─────────────────────────────────────
if ! command -v Xvfb &>/dev/null; then
  echo "Xvfb가 설치되어 있지 않습니다."
  if command -v pacman &>/dev/null; then
    echo "  sudo pacman -S xorg-server-xvfb"
  elif command -v apt-get &>/dev/null; then
    echo "  sudo apt-get install -y xvfb"
  fi
  exit 1
fi

# ── 정리 함수 ──────────────────────────────────────────
cleanup() {
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 전체 종료 중..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # Xvfb 프로세스도 정리
  for i in $(seq 0 $((NUM-1))); do
    local disp=$((BASE_DISPLAY + i))
    local xvfb_pid_file="/tmp/.xvfb-collect-${disp}.pid"
    if [[ -f "$xvfb_pid_file" ]]; then
      local xpid
      xpid=$(cat "$xvfb_pid_file")
      kill "$xpid" 2>/dev/null || true
      rm -f "$xvfb_pid_file"
    fi
  done
  wait 2>/dev/null || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 정리 완료"
}
trap cleanup EXIT INT TERM

# ── 프로필 디렉토리 확인 ───────────────────────────────
for i in $(seq 0 $((NUM-1))); do
  profile_dir="${PROFILE_BASE}/chrome-profile-${i}"
  if [[ ! -d "$profile_dir" ]]; then
    echo "[경고] 프로필 미존재: ${profile_dir}"
    echo "  로그인 필요: PROFILE_DIR=${profile_dir} npm run collect:visible"
  fi
done

# ── 인스턴스별 실행 ───────────────────────────────────
for i in $(seq 0 $((NUM-1))); do
  disp=$((BASE_DISPLAY + i))
  profile_dir="${PROFILE_BASE}/chrome-profile-${i}"

  # 이미 사용 중인 디스플레이 건너뛰기
  while [[ -e "/tmp/.X${disp}-lock" ]]; do
    disp=$((disp + 1))
  done

  # Xvfb 시작
  Xvfb ":${disp}" -screen 0 "1280x720x24" -ac -nolisten tcp &
  local_xvfb_pid=$!
  echo "$local_xvfb_pid" > "/tmp/.xvfb-collect-${disp}.pid"
  sleep 0.5

  if ! kill -0 "$local_xvfb_pid" 2>/dev/null; then
    echo "[I${i}] Xvfb :${disp} 시작 실패, 건너뜁니다"
    continue
  fi

  echo "[I${i}] Xvfb :${disp} (PID: ${local_xvfb_pid}) | 프로필: ${profile_dir}"

  # Collector 실행 (백그라운드)
  DISPLAY=":${disp}" \
  XVFB_MODE=1 \
  PROFILE_DIR="${profile_dir}" \
  INSTANCE_ID="${i}" \
  NUM_INSTANCES="${NUM}" \
  MIN_PAYOUT="${MIN_PAYOUT}" \
  ONLY_OTC="${ONLY_OTC}" \
  OFFSET="${OFFSET}" \
  MAX_DAYS="${MAX_DAYS}" \
  REQUEST_DELAY="${REQUEST_DELAY}" \
  npx tsx "${SCRIPT_DIR}/headless-collector.ts" 2>&1 | sed "s/^/[I${i}] /" &

  PIDS+=($!)
  echo "[I${i}] Collector 시작 (PID: ${PIDS[-1]})"
  echo ""
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${#PIDS[@]}개 인스턴스 실행 중. Ctrl+C로 전체 종료."
echo ""

# 모든 자식 프로세스 대기
wait "${PIDS[@]}"

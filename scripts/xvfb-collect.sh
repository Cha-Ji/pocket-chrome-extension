#!/bin/bash
# Xvfb 가상 디스플레이에서 headless-collector 실행
#
# GUI(모니터/WSLg) 없는 환경에서 Chrome Extension 기반 데이터 수집을 위해
# Xvfb(가상 프레임버퍼)로 화면을 시뮬레이션합니다.
#
# 사용법:
#   npm run collect:xvfb
#   bash scripts/xvfb-collect.sh
#   bash scripts/xvfb-collect.sh --resolution 1920x1080
#   bash scripts/xvfb-collect.sh --display :50

set -euo pipefail

# ── 기본값 ──────────────────────────────────────────────
RESOLUTION="1280x720"
DISPLAY_NUM=""
XVFB_PID=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 옵션 파싱 ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resolution)
      RESOLUTION="$2"
      shift 2
      ;;
    --display)
      DISPLAY_NUM="${2#:}"  # ':99' → '99'
      shift 2
      ;;
    -h|--help)
      echo "사용법: $0 [옵션]"
      echo ""
      echo "옵션:"
      echo "  --resolution WxH   화면 해상도 (기본: 1280x720)"
      echo "  --display :N       디스플레이 번호 (기본: 자동 탐색)"
      echo "  -h, --help         도움말"
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1"
      echo "$0 --help 로 도움말을 확인하세요."
      exit 1
      ;;
  esac
done

# ── Xvfb 설치 확인 ─────────────────────────────────────
if ! command -v Xvfb &>/dev/null; then
  echo "❌ Xvfb가 설치되어 있지 않습니다."
  echo ""
  echo "설치 방법:"
  echo "  sudo apt-get update && sudo apt-get install -y xvfb"
  echo ""
  exit 1
fi

# ── 디스플레이 번호 자동 탐색 ──────────────────────────
if [[ -z "$DISPLAY_NUM" ]]; then
  DISPLAY_NUM=99
  while [[ -e "/tmp/.X${DISPLAY_NUM}-lock" ]]; do
    DISPLAY_NUM=$((DISPLAY_NUM + 1))
    if [[ $DISPLAY_NUM -gt 199 ]]; then
      echo "❌ 사용 가능한 디스플레이 번호를 찾을 수 없습니다 (:99~:199)"
      exit 1
    fi
  done
fi

# ── 정리 함수 ──────────────────────────────────────────
cleanup() {
  local exit_code=$?
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 정리 중..."
  if [[ -n "$XVFB_PID" ]] && kill -0 "$XVFB_PID" 2>/dev/null; then
    kill "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Xvfb (PID $XVFB_PID) 종료됨"
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

# ── Xvfb 시작 ─────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Xvfb 시작: 디스플레이=:${DISPLAY_NUM}, 해상도=${RESOLUTION}x24"
Xvfb ":${DISPLAY_NUM}" -screen 0 "${RESOLUTION}x24" -ac -nolisten tcp &
XVFB_PID=$!

# Xvfb 시작 대기
sleep 1
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "❌ Xvfb 시작 실패"
  exit 1
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Xvfb 실행 중 (PID: $XVFB_PID)"

# ── Collector 실행 ─────────────────────────────────────
export DISPLAY=":${DISPLAY_NUM}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] DISPLAY=${DISPLAY} 로 headless-collector 시작"
echo ""

# collector의 종료 코드를 전달
npx tsx "${SCRIPT_DIR}/headless-collector.ts"

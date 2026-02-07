#!/bin/bash
# ============================================================
# Mining Pipeline Diagnostic Runner
# ============================================================
# LLM이 한 번에 실행하여 파이프라인 상태를 진단할 수 있는 스크립트.
#
# 사용법:
#   ./scripts/run-mining-diagnostic.sh                    # 새 프로필
#   ./scripts/run-mining-diagnostic.sh ./test-profile     # 기존 프로필
#   MINE_DURATION=60000 ./scripts/run-mining-diagnostic.sh  # 60초 관찰
#
# 사전 조건:
#   1. npm run build (익스텐션 빌드)
#   2. npm run collector (로컬 DB 서버)
#   3. Tampermonkey + inject-websocket.user.js (브라우저에 설치)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_PROFILE="${1:-}"
MINE_DURATION="${MINE_DURATION:-30000}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Mining Pipeline Diagnostic                       ║"
echo "╠══════════════════════════════════════════════════════════╣"

# Pre-flight checks
echo "║ Pre-flight checks...                                     ║"

# 1. dist/ exists?
if [ ! -d "$PROJECT_ROOT/dist" ]; then
  echo "║ ✗ dist/ not found. Run: npm run build                   ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
echo "║ ✓ Extension built (dist/)                                ║"

# 2. Collector server running?
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  CANDLE_COUNT=$(curl -sf http://localhost:3001/health | grep -o '"totalCandles":[0-9]*' | grep -o '[0-9]*')
  echo "║ ✓ Collector server running (${CANDLE_COUNT} candles)               ║"
else
  echo "║ ✗ Collector server not running. Run: npm run collector   ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi

# 3. Playwright installed?
if ! npx playwright --version > /dev/null 2>&1; then
  echo "║ ✗ Playwright not installed. Run: npx playwright install  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
echo "║ ✓ Playwright ready                                       ║"

echo "║                                                          ║"
echo "║ Profile: ${TEST_PROFILE:-<temporary>}"
echo "║ Mine duration: ${MINE_DURATION}ms"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Run the diagnostic test
export TEST_PROFILE="${TEST_PROFILE}"
export MINE_DURATION="${MINE_DURATION}"

cd "$PROJECT_ROOT"
npx playwright test mining-diagnostic \
  --project=extension-diagnostic \
  --headed \
  --reporter=list \
  2>&1 | tee /tmp/mining-diagnostic-$(date +%Y%m%d-%H%M%S).log

echo ""
echo "Done. Full log saved to /tmp/mining-diagnostic-*.log"

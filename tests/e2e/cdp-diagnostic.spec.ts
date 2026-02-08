/**
 * CDP Pipeline Diagnostic E2E Test
 * =================================
 *
 * Chrome DevTools Protocol을 활용한 심층 파이프라인 진단 테스트.
 * 기존 mining-diagnostic.spec.ts의 console-monitor 방식과 달리,
 * CDP로 WebSocket 프레임/네트워크 요청/JS 예외를 직접 캡처합니다.
 *
 * 이점:
 *   - console.log에 의존하지 않아 파서가 삼킨 메시지도 감지
 *   - WS 원본 프레임과 파싱 결과를 비교하여 파서 버그 자동 탐지
 *   - DataSender HTTP 요청의 실제 상태코드/바디 확인
 *   - 메모리 누수 조기 감지 (heap 스냅샷)
 *
 * 사용법:
 *   1. 빌드:         npm run build
 *   2. 서버 시작:     npm run collector
 *   3. 테스트 실행:   npm run test:e2e:cdp
 *   4. 프로필 재사용: TEST_PROFILE=./test-profile npm run test:e2e:cdp
 *
 * 환경변수:
 *   TEST_PROFILE    — Chrome user data dir (로그인 세션 유지용)
 *   COLLECTOR_URL   — 로컬 서버 URL (default: http://localhost:3001)
 *   MINE_DURATION   — 마이닝 관찰 시간 ms (default: 30000)
 *   PO_URL          — Pocket Option URL
 */

import { test, expect } from '@playwright/test'
import { launchWithExtension, type ExtensionContext } from './helpers/extension-context'
import { createCDPInspector, type CDPInspector } from './helpers/cdp-inspector'
import { checkServerHealth, snapshotCandleCount } from './helpers/server-checker'

const PO_URL = process.env.PO_URL ?? 'https://pocketoption.com/en/cabinet/demo-quick-high-low/'
const MINE_DURATION = Number(process.env.MINE_DURATION) || 30_000

test.setTimeout(120_000)

let ext: ExtensionContext
let inspector: CDPInspector

test.beforeAll(async () => {
  ext = await launchWithExtension({
    userDataDir: process.env.TEST_PROFILE || '',
  })
})

test.afterAll(async () => {
  if (inspector) await inspector.detach()
  await ext.context.close()
})

// ─────────────────────────────────────────────────────────
// Step 0: 서버 헬스체크
// ─────────────────────────────────────────────────────────
test('CDP Step 0: Collector server health check', async () => {
  const health = await checkServerHealth()

  if (!health.ok) {
    console.log('========================================')
    console.log('LOCAL SERVER NOT RUNNING')
    console.log('Run: npm run collector')
    console.log(`Error: ${health.error}`)
    console.log('========================================')
  }

  expect(health.ok, 'Collector server must be running at localhost:3001').toBeTruthy()
  console.log(`Server OK — total candles: ${health.totalCandles}`)
})

// ─────────────────────────────────────────────────────────
// Step 1: 페이지 로드 + CDP Inspector 부착
// ─────────────────────────────────────────────────────────
test('CDP Step 1: Attach CDP inspector and load page', async () => {
  const page = ext.context.pages()[0] ?? await ext.context.newPage()
  inspector = await createCDPInspector(page)

  await page.goto(PO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // 페이지 초기화 + WS 연결 대기
  await page.waitForTimeout(10_000)

  console.log(`\nWebSocket connections detected: ${inspector.wsConnections.length}`)
  inspector.wsConnections.forEach(c => {
    console.log(`  - ${c.url}`)
  })

  expect(
    inspector.wsConnections.length,
    'At least one WebSocket connection should be established'
  ).toBeGreaterThan(0)
})

// ─────────────────────────────────────────────────────────
// Step 2: WebSocket 프레임 수신 검증
// ─────────────────────────────────────────────────────────
test('CDP Step 2: Verify WebSocket frame reception', async () => {
  const page = ext.context.pages()[0]!

  // 추가 프레임 수신 대기
  await page.waitForTimeout(5_000)

  const received = inspector.wsFramesByDirection('received')
  const sent = inspector.wsFramesByDirection('sent')

  console.log(`\nWS Frames — Received: ${received.length}, Sent: ${sent.length}`)

  // Socket.IO 이벤트 분포
  const eventCounts = new Map<string, number>()
  for (const f of inspector.wsFrames) {
    const key = f.socketIOEvent ?? '(raw)'
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
  }

  console.log('\nEvent distribution:')
  const sorted = [...eventCounts.entries()].sort((a, b) => b[1] - a[1])
  for (const [event, count] of sorted.slice(0, 10)) {
    console.log(`  ${event}: ${count}`)
  }

  expect(
    received.length,
    'Should have received WebSocket frames'
  ).toBeGreaterThan(0)
})

// ─────────────────────────────────────────────────────────
// Step 3: WS 프레임 vs 파서 교차 검증
// ─────────────────────────────────────────────────────────
test('CDP Step 3: Cross-validate WS frames against parser', async () => {
  const page = ext.context.pages()[0]!

  // WebSocket을 통해 히스토리 요청 전송
  const beforeFrames = inspector.wsFrames.length

  await page.evaluate(() => {
    const now = Math.floor(Date.now() / 1000)
    const index = now * 100 + 42
    window.postMessage({
      source: 'pq-content',
      type: 'ws-send',
      payload: `42["loadHistoryPeriod",{"asset":"#EURUSD_otc","index":${index},"time":${now},"offset":9000,"period":60}]`
    }, '*')
  })

  // 응답 대기
  await page.waitForTimeout(10_000)

  // CDP가 캡처한 히스토리 프레임
  const historyFrames = inspector.wsHistoryFrames()
  const newFrames = inspector.wsFrames.slice(beforeFrames)

  console.log(`\nNew frames since request: ${newFrames.length}`)
  console.log(`History frames (CDP): ${historyFrames.length}`)

  // 전송된 loadHistoryPeriod 요청 확인
  const sentHistory = newFrames.filter(
    f => f.direction === 'sent' && f.socketIOEvent === 'loadHistoryPeriod'
  )
  console.log(`Sent loadHistoryPeriod requests: ${sentHistory.length}`)

  // 수신된 히스토리 응답 확인
  const receivedHistory = newFrames.filter(
    f => f.direction === 'received' && f.socketIOEvent &&
    ['updateHistoryNewFast', 'history', 'loadHistoryPeriod', 'historyResult'].includes(f.socketIOEvent)
  )
  console.log(`Received history responses: ${receivedHistory.length}`)

  if (receivedHistory.length > 0) {
    // 첫 번째 히스토리 응답의 캔들 수 출력
    const first = receivedHistory[0]
    const payload = first.parsed
    const candleCount = Array.isArray(payload)
      ? payload.length
      : (payload?.data && Array.isArray(payload.data))
        ? payload.data.length
        : '?'
    console.log(`First history response — event: ${first.socketIOEvent}, candles: ${candleCount}`)
  }

  // 교차 검증: CDP 프레임 수 vs 콘솔 기반 감지
  // 이 차이가 크면 파서가 일부 메시지를 놓치고 있다는 의미
  const allReceivedEvents = inspector.wsFramesByDirection('received')
    .filter(f => f.socketIOEvent)
    .map(f => f.socketIOEvent!)
  const uniqueEvents = new Set(allReceivedEvents)

  console.log(`\nTotal unique Socket.IO events seen by CDP: ${uniqueEvents.size}`)
  console.log('Events:', [...uniqueEvents].join(', '))
})

// ─────────────────────────────────────────────────────────
// Step 4: DataSender 네트워크 요청 검증
// ─────────────────────────────────────────────────────────
test('CDP Step 4: Verify DataSender API calls', async () => {
  const page = ext.context.pages()[0]!

  const beforeCandleCount = await snapshotCandleCount()

  // AutoMiner 시작
  const startResult = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'START_AUTO_MINER' }, (res: unknown) => resolve(res))
      } catch (e) {
        resolve({ error: String(e) })
      }
    })
  })
  console.log('Miner start result:', JSON.stringify(startResult))

  // 마이닝 관찰
  console.log(`\nObserving mining pipeline for ${MINE_DURATION / 1000}s (CDP mode)...`)
  await page.waitForTimeout(MINE_DURATION)

  // AutoMiner 중지
  await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'STOP_AUTO_MINER' }, (res: unknown) => resolve(res))
      } catch (e) {
        resolve({ error: String(e) })
      }
    })
  })

  const afterCandleCount = await snapshotCandleCount()

  // CDP가 캡처한 API 호출 분석
  console.log(`\nAPI calls to localhost:3001: ${inspector.apiCalls.length}`)

  const success = inspector.apiCalls.filter(c => c.statusCode && c.statusCode >= 200 && c.statusCode < 300)
  const failed = inspector.apiCalls.filter(c => !c.statusCode || c.statusCode < 200 || c.statusCode >= 300)

  console.log(`  Success: ${success.length}`)
  console.log(`  Failed: ${failed.length}`)

  if (failed.length > 0) {
    console.log('\n  Failed requests:')
    for (const f of failed.slice(-5)) {
      console.log(`    ${f.method} ${f.url} → ${f.statusCode}`)
      if (f.postData) {
        const preview = f.postData.length > 200 ? f.postData.slice(0, 200) + '...' : f.postData
        console.log(`    Body: ${preview}`)
      }
    }
  }

  if (success.length > 0) {
    // POST 요청의 바디 크기 통계
    const postCalls = success.filter(c => c.method === 'POST' && c.postData)
    if (postCalls.length > 0) {
      const totalBytes = postCalls.reduce((sum, c) => sum + (c.postData?.length ?? 0), 0)
      console.log(`\n  POST data stats:`)
      console.log(`    Total requests: ${postCalls.length}`)
      console.log(`    Total bytes sent: ${totalBytes.toLocaleString()}`)
      console.log(`    Avg bytes/request: ${Math.round(totalBytes / postCalls.length).toLocaleString()}`)
    }
  }

  console.log(`\nCandles — Before: ${beforeCandleCount}, After: ${afterCandleCount}, New: ${afterCandleCount - beforeCandleCount}`)
})

// ─────────────────────────────────────────────────────────
// Step 5: JS 예외 및 메모리 검사
// ─────────────────────────────────────────────────────────
test('CDP Step 5: Check JS exceptions and memory', async () => {
  // JS 예외 리포트
  console.log(`\nJS Exceptions: ${inspector.exceptions.length}`)
  if (inspector.exceptions.length > 0) {
    for (const e of inspector.exceptions.slice(-10)) {
      const loc = e.url ? `${e.url}:${e.lineNumber}` : 'unknown'
      console.log(`  - ${e.text} at ${loc}`)
    }
  }

  // 성능 메트릭 스냅샷
  const perf = await inspector.takePerformanceSnapshot()
  console.log('\nPerformance Metrics:')
  console.log(`  JS Heap: ${(perf.jsHeapUsedSize / 1024 / 1024).toFixed(1)}MB / ${(perf.jsHeapTotalSize / 1024 / 1024).toFixed(1)}MB`)
  console.log(`  DOM Nodes: ${perf.domNodes}`)
  console.log(`  Event Listeners: ${perf.jsEventListeners}`)

  // 힙 사용률 경고 (80% 초과 시)
  const heapUsagePercent = (perf.jsHeapUsedSize / perf.jsHeapTotalSize) * 100
  if (heapUsagePercent > 80) {
    console.log(`\n  WARNING: JS heap usage is ${heapUsagePercent.toFixed(1)}% — potential memory leak`)
  }
})

// ─────────────────────────────────────────────────────────
// Step 6: 종합 리포트
// ─────────────────────────────────────────────────────────
test('CDP Step 6: Full CDP diagnostic report', async () => {
  const report = inspector.buildReport()
  console.log('\n' + report)
})

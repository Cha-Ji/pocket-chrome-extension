/**
 * CDP Pipeline Diagnostic E2E Test
 * =================================
 *
 * Chrome DevTools Protocol을 활용한 심층 파이프라인 진단 테스트.
 *
 * 핵심 차별점: CDP의 `Page.addScriptToEvaluateOnNewDocument`로
 * CDP로 WS Hook을 Main World에 자동 주입하여
 * 마이닝 파이프라인 전체를 E2E 테스트할 수 있습니다.
 *
 * 파이프라인 커버리지:
 *   [CDP WS Hook] → Content Script Interceptor → Parser →
 *   onHistoryReceived → DataSender → localhost:3001
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
import { injectWSBridge } from './helpers/ws-bridge-injector'
import { checkServerHealth, snapshotCandleCount } from './helpers/server-checker'
import { attachConsoleMonitor } from './helpers/console-monitor'

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
// Step 1: CDP Inspector 부착 + WS Bridge 주입 + 페이지 로드
// ─────────────────────────────────────────────────────────
test('CDP Step 1: Inject WS bridge via CDP and load page', async () => {
  const page = ext.context.pages()[0] ?? await ext.context.newPage()
  inspector = await createCDPInspector(page)

  // 핵심: CDP로 WS Hook을 Main World에 주입 (테스트 환경용)
  // page.goto() 이전에 호출해야 document-start 시점에 실행됨
  const cdp = await page.context().newCDPSession(page)
  await injectWSBridge(cdp)

  console.log('WS Bridge injected via CDP (for E2E test environment)')

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
// Step 2: WS Bridge 동작 검증 (프레임 수신 확인)
// ─────────────────────────────────────────────────────────
test('CDP Step 2: Verify WS bridge captures frames', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  // 프레임 수신 대기
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

  // Bridge가 정상 동작하면 BRIDGE stage 로그가 있어야 함
  const bridgeLogs = monitor.byStage('BRIDGE')
  console.log(`\nBRIDGE console logs: ${bridgeLogs.length}`)
  if (bridgeLogs.length > 0) {
    console.log('  Bridge is connected and forwarding messages')
  } else {
    console.log('  WARNING: No BRIDGE logs — CDP hook may not be forwarding to content script')
  }

  expect(
    received.length,
    'CDP should capture WebSocket frames directly from the wire'
  ).toBeGreaterThan(0)

  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Step 3: WS 히스토리 요청/응답 교차 검증
// ─────────────────────────────────────────────────────────
test('CDP Step 3: Cross-validate WS history request/response', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  const beforeFrames = inspector.wsFrames.length

  // Content Script → Bridge → WebSocket으로 히스토리 요청
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

  const newFrames = inspector.wsFrames.slice(beforeFrames)
  const historyFrames = inspector.wsHistoryFrames()

  // CDP에서 본 것
  const sentHistory = newFrames.filter(
    f => f.direction === 'sent' && f.payload.includes('loadHistoryPeriod')
  )
  const receivedHistory = newFrames.filter(
    f => f.direction === 'received' && f.socketIOEvent &&
    ['updateHistoryNewFast', 'history', 'loadHistoryPeriod', 'historyResult'].includes(f.socketIOEvent)
  )

  console.log('\n=== CDP 교차 검증 결과 ===')
  console.log(`New frames since request: ${newFrames.length}`)
  console.log(`Sent loadHistoryPeriod (CDP wire): ${sentHistory.length}`)
  console.log(`Received history response (CDP wire): ${receivedHistory.length}`)

  // Console-monitor에서 본 것
  const parserLogs = monitor.byStage('PARSER')
  const historyLogs = monitor.byStage('HISTORY')
  console.log(`Parser console logs: ${parserLogs.length}`)
  console.log(`History console logs: ${historyLogs.length}`)

  // 교차 비교: CDP는 프레임을 봤는데 파서가 못 봤으면 = 파서 버그
  if (sentHistory.length > 0 && receivedHistory.length === 0) {
    console.log('\n  DIAGNOSIS: Request sent but no history response received')
    console.log('  → Server may not recognize the asset or request format')
  }
  if (receivedHistory.length > 0 && historyLogs.length === 0) {
    console.log('\n  DIAGNOSIS: CDP saw history response but content script parser missed it!')
    console.log('  → Parser bug: websocket-parser.ts is not recognizing this response format')
    console.log('  → Raw payload sample:')
    console.log(`    ${receivedHistory[0].payload.slice(0, 300)}`)
  }
  if (sentHistory.length === 0) {
    console.log('\n  DIAGNOSIS: loadHistoryPeriod was NOT sent on the wire')
    console.log('  → Bridge may not have found an active WebSocket connection')
    console.log('  → Check if page has a live WebSocket:')
    console.log(`    Active WS connections: ${inspector.wsConnections.length}`)
  }

  // 전체 이벤트 타입 목록 (LLM이 새 패턴 발견에 활용)
  const uniqueEvents = new Set(
    inspector.wsFramesByDirection('received')
      .filter(f => f.socketIOEvent)
      .map(f => f.socketIOEvent!)
  )
  console.log(`\nAll unique Socket.IO events (${uniqueEvents.size}):`)
  console.log([...uniqueEvents].join(', '))

  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Step 4: 마이닝 파이프라인 전체 검증 (AutoMiner → Server)
// ─────────────────────────────────────────────────────────
test('CDP Step 4: Full mining pipeline — AutoMiner to server', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  const beforeCandleCount = await snapshotCandleCount()
  const beforeApiCalls = inspector.apiCalls.length
  const beforeWsFrames = inspector.wsFrames.length

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
  const newApiCalls = inspector.apiCalls.slice(beforeApiCalls)
  const newWsFrames = inspector.wsFrames.slice(beforeWsFrames)

  // ── 파이프라인 각 단계 검증 ────────────────────────

  // Stage 1: AutoMiner가 WS 요청을 보냈는가?
  const minerSentFrames = newWsFrames.filter(
    f => f.direction === 'sent' && f.payload.includes('loadHistoryPeriod')
  )

  // Stage 2: WS 히스토리 응답이 돌아왔는가?
  const minerReceivedHistory = newWsFrames.filter(
    f => f.direction === 'received' && f.socketIOEvent &&
    ['updateHistoryNewFast', 'history', 'loadHistoryPeriod', 'historyResult', 'candleHistory'].includes(f.socketIOEvent)
  )

  // Stage 3: Content Script 파서가 인식했는가?
  const historyLogs = monitor.byStage('HISTORY')
  const senderLogs = monitor.byStage('SENDER')

  // Stage 4: DataSender가 서버에 요청했는가?
  const apiSuccess = newApiCalls.filter(c => c.statusCode && c.statusCode >= 200 && c.statusCode < 300)
  const apiFailed = newApiCalls.filter(c => !c.statusCode || c.statusCode < 200 || c.statusCode >= 300)

  // Stage 5: 서버에 데이터가 저장되었는가?
  const newCandles = afterCandleCount - beforeCandleCount

  console.log('\n=== Mining Pipeline Stage Results ===')
  console.log(`[Stage 1] WS requests sent (loadHistoryPeriod): ${minerSentFrames.length}`)
  console.log(`[Stage 2] WS history responses received: ${minerReceivedHistory.length}`)
  console.log(`[Stage 3] Parser HISTORY logs: ${historyLogs.length}`)
  console.log(`[Stage 4] API calls to server: ${newApiCalls.length} (success: ${apiSuccess.length}, failed: ${apiFailed.length})`)
  console.log(`[Stage 5] New candles in DB: ${newCandles}`)

  // 단계별 진단
  const stages = [
    { name: 'WS Request Sent', ok: minerSentFrames.length > 0 },
    { name: 'WS Response Received', ok: minerReceivedHistory.length > 0 },
    { name: 'Parser Recognized', ok: historyLogs.length > 0 },
    { name: 'API Called', ok: newApiCalls.length > 0 },
    { name: 'API Succeeded', ok: apiSuccess.length > 0 },
    { name: 'Data Saved', ok: newCandles > 0 },
  ]

  console.log('\n=== Pipeline Health ===')
  for (const stage of stages) {
    console.log(`[${stage.ok ? 'x' : ' '}] ${stage.name}`)
  }

  const firstFail = stages.find(s => !s.ok)
  if (firstFail) {
    console.log(`\n** Pipeline breaks at: ${firstFail.name} **`)
  } else {
    console.log('\n** All pipeline stages passed! **')
  }

  // API 실패 상세
  if (apiFailed.length > 0) {
    console.log('\nFailed API calls:')
    for (const f of apiFailed.slice(-3)) {
      console.log(`  ${f.method} ${f.url} → ${f.statusCode}`)
      if (f.postData) {
        console.log(`  Body preview: ${f.postData.slice(0, 200)}`)
      }
    }
  }

  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Step 5: JS 예외 및 메모리 검사
// ─────────────────────────────────────────────────────────
test('CDP Step 5: Check JS exceptions and memory', async () => {
  console.log(`\nJS Exceptions: ${inspector.exceptions.length}`)
  if (inspector.exceptions.length > 0) {
    for (const e of inspector.exceptions.slice(-10)) {
      const loc = e.url ? `${e.url}:${e.lineNumber}` : 'unknown'
      console.log(`  - ${e.text} at ${loc}`)
    }
  }

  const perf = await inspector.takePerformanceSnapshot()
  console.log('\nPerformance Metrics:')
  console.log(`  JS Heap: ${(perf.jsHeapUsedSize / 1024 / 1024).toFixed(1)}MB / ${(perf.jsHeapTotalSize / 1024 / 1024).toFixed(1)}MB`)
  console.log(`  DOM Nodes: ${perf.domNodes}`)
  console.log(`  Event Listeners: ${perf.jsEventListeners}`)

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

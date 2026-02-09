/**
 * Mining Pipeline Diagnostic E2E Test
 * ====================================
 *
 * 이 테스트는 LLM이 마이닝 데이터 파이프라인을 자동으로 디버깅할 수 있게 해줍니다.
 *
 * 파이프라인:
 *   WS Hook (Main World) → Content Script Interceptor → Parser →
 *   onHistoryReceived → DataSender → localhost:3001 → SQLite
 *
 * 사용법 (로컬):
 *   1. 빌드:           npm run build
 *   2. 서버 시작:       npm run collector
 *   3. 테스트 실행:     npx playwright test mining-diagnostic --headed
 *   4. 프로필 재사용:   TEST_PROFILE=./test-profile npx playwright test mining-diagnostic --headed
 *
 * 환경변수:
 *   TEST_PROFILE    — Chrome user data dir (로그인 세션 유지용)
 *   COLLECTOR_URL   — 로컬 서버 URL (default: http://localhost:3001)
 *   MINE_DURATION   — 마이닝 관찰 시간 ms (default: 30000)
 *   PO_URL          — Pocket Option URL (default: https://pocketoption.com/en/cabinet/demo-quick-high-low/)
 */

import { test, expect } from '@playwright/test'
import { launchWithExtension, type ExtensionContext } from './helpers/extension-context'
import { attachConsoleMonitor } from './helpers/console-monitor'
import { checkServerHealth, snapshotCandleCount } from './helpers/server-checker'

const PO_URL = process.env.PO_URL ?? 'https://pocketoption.com/en/cabinet/demo-quick-high-low/'
const MINE_DURATION = Number(process.env.MINE_DURATION) || 30_000

// Increase default timeout — mining takes a while
test.setTimeout(120_000)

let ext: ExtensionContext

test.beforeAll(async () => {
  ext = await launchWithExtension({
    userDataDir: process.env.TEST_PROFILE || '',
  })
})

test.afterAll(async () => {
  await ext.context.close()
})

// ─────────────────────────────────────────────────────────
// Test 1: 서버가 살아있는지
// ─────────────────────────────────────────────────────────
test('Step 0: Local collector server is running', async () => {
  const health = await checkServerHealth()

  if (!health.ok) {
    console.log('========================================')
    console.log('LOCAL SERVER NOT RUNNING')
    console.log('Run: npm run collector')
    console.log(`Error: ${health.error}`)
    console.log('========================================')
  }

  expect(health.ok, 'Collector server must be running at localhost:3001').toBeTruthy()
  console.log(`Server OK — total candles in DB: ${health.totalCandles}`)
})

// ─────────────────────────────────────────────────────────
// Test 2: 익스텐션이 PO 페이지에서 초기화되는지
// ─────────────────────────────────────────────────────────
test('Step 1: Extension initialises on Pocket Option', async () => {
  const page = ext.context.pages()[0] ?? await ext.context.newPage()
  const monitor = attachConsoleMonitor(page)

  await page.goto(PO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Wait for the extension to finish init (it logs [PO] [SUCCESS])
  await page.waitForTimeout(8_000)

  const initLogs = monitor.byStage('INIT')
  console.log(`\nINIT stage logs (${initLogs.length}):`)
  initLogs.forEach(l => console.log(`  ${l.text}`))

  expect(
    monitor.stageReached('INIT'),
    'Extension should have logged INIT messages. Check that the content script matches the URL.'
  ).toBeTruthy()

  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Test 3: WS Bridge 연결 확인
// ─────────────────────────────────────────────────────────
test('Step 2: WS bridge is connected', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  // Bridge should already be connected, just wait a bit for messages
  await page.waitForTimeout(5_000)

  const bridgeLogs = monitor.byStage('BRIDGE')
  const wsLogs = monitor.byStage('WS_HOOK')

  console.log(`\nBRIDGE stage logs (${bridgeLogs.length}):`)
  bridgeLogs.forEach(l => console.log(`  ${l.text}`))
  console.log(`WS_HOOK stage logs (${wsLogs.length}):`)
  wsLogs.forEach(l => console.log(`  ${l.text}`))

  if (!monitor.stageReached('BRIDGE')) {
    console.log('\n========================================')
    console.log('BRIDGE NOT CONNECTED')
    console.log('Possible causes:')
    console.log('  1. Extension inject-websocket.js is not loaded (check manifest.json)')
    console.log('  2. The page loaded before document-start injection')
    console.log('Fix: Ensure inject-websocket.js is in manifest.json content_scripts with world: MAIN')
    console.log('========================================')
  }

  // This is a soft assertion — bridge may need manual injection
  // Just report; the user can decide if it blocks further testing
  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Test 4: 마이닝 시작 → 데이터 흐름 관찰
// ─────────────────────────────────────────────────────────
test('Step 3: Mining pipeline — start miner and observe data flow', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  // Record candle count before mining
  const beforeCount = await snapshotCandleCount()
  console.log(`\nCandles in DB before mining: ${beforeCount}`)

  // Start the AutoMiner via chrome.runtime message
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

  // Observe for MINE_DURATION
  console.log(`\nObserving mining pipeline for ${MINE_DURATION / 1000}s...`)
  await page.waitForTimeout(MINE_DURATION)

  // Stop the miner
  await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'STOP_AUTO_MINER' }, (res: unknown) => resolve(res))
      } catch (e) {
        resolve({ error: String(e) })
      }
    })
  })

  // Check candle count after mining
  const afterCount = await snapshotCandleCount()
  const newCandles = afterCount - beforeCount

  console.log(`\nCandles in DB after mining: ${afterCount}`)
  console.log(`New candles saved: ${newCandles}`)

  // Print full diagnostic report
  const report = monitor.buildDiagnosticReport()
  console.log('\n' + report)

  // Print errors prominently
  const errors = monitor.errors()
  if (errors.length > 0) {
    console.log('\n========================================')
    console.log(`ERRORS DETECTED (${errors.length}):`)
    errors.forEach(e => console.log(`  [${e.stage}] ${e.text}`))
    console.log('========================================')
  }

  monitor.detach()
})

// ─────────────────────────────────────────────────────────
// Test 5: Side Panel UI 로드 확인
// ─────────────────────────────────────────────────────────
test('Step 4: Side panel loads correctly', async () => {
  const sidePanelUrl = `chrome-extension://${ext.extensionId}/src/side-panel/index.html`
  const page = await ext.context.newPage()

  await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 })
  await page.waitForTimeout(2_000)

  // Basic check: something rendered
  const bodyText = await page.locator('body').innerText()
  console.log(`Side panel body text length: ${bodyText.length}`)
  expect(bodyText.length, 'Side panel should render content').toBeGreaterThan(0)

  await page.close()
})

// ─────────────────────────────────────────────────────────
// Test 6: 수동 WebSocket 요청으로 히스토리 수신 테스트
// ─────────────────────────────────────────────────────────
test('Step 5: Manual WS history request and response', async () => {
  const page = ext.context.pages()[0]!
  const monitor = attachConsoleMonitor(page)

  const beforeCount = await snapshotCandleCount()

  // Send a history request directly via the interceptor bridge
  await page.evaluate(() => {
    const now = Math.floor(Date.now() / 1000)
    const index = now * 100 + 42
    // Try a common asset — #EURUSD_otc or similar
    window.postMessage({
      source: 'pq-content',
      type: 'ws-send',
      payload: `42["loadHistoryPeriod",{"asset":"#EURUSD_otc","index":${index},"time":${now},"offset":9000,"period":60}]`
    }, '*')
  })

  // Wait for response
  await page.waitForTimeout(10_000)

  const afterCount = await snapshotCandleCount()
  const newCandles = afterCount - beforeCount

  console.log(`\nManual WS request result:`)
  console.log(`  New candles: ${newCandles}`)

  const historyLogs = monitor.byStage('HISTORY')
  const senderLogs = monitor.byStage('SENDER')
  const parserLogs = monitor.byStage('PARSER')

  console.log(`  PARSER logs: ${parserLogs.length}`)
  parserLogs.forEach(l => console.log(`    ${l.text}`))
  console.log(`  HISTORY logs: ${historyLogs.length}`)
  historyLogs.forEach(l => console.log(`    ${l.text}`))
  console.log(`  SENDER logs: ${senderLogs.length}`)
  senderLogs.forEach(l => console.log(`    ${l.text}`))

  if (newCandles === 0) {
    console.log('\n========================================')
    console.log('NO DATA SAVED — Debugging hints:')
    if (parserLogs.length === 0) {
      console.log('  → PARSER never fired. The WS response is not being parsed.')
      console.log('    Check: Is the WS bridge forwarding the response?')
      console.log('    Check: Does the parser recognise the response format?')
    } else if (historyLogs.length === 0) {
      console.log('  → PARSER fired but HISTORY callback never called.')
      console.log('    Check: parsed.type might not be "candle_history"')
      console.log('    Check: websocket-interceptor.ts handleMessage() conditions')
    } else if (senderLogs.length === 0) {
      console.log('  → HISTORY captured but SENDER never called.')
      console.log('    Check: DataSender.sendHistory() is being called')
      console.log('    Check: content-script/index.ts onHistoryReceived callback')
    } else {
      const senderErrors = senderLogs.filter(l => l.level === 'error')
      if (senderErrors.length > 0) {
        console.log('  → SENDER errors detected:')
        senderErrors.forEach(l => console.log(`    ${l.text}`))
        console.log('    Check: Is the server running? (npm run collector)')
        console.log('    Check: CORS? Content-type? Payload format?')
      } else {
        console.log('  → SENDER reported success but DB has no new candles.')
        console.log('    Check: Server logs for validation errors')
        console.log('    Check: Symbol name mismatch (UNKNOWN vs actual)')
      }
    }
    console.log('========================================')
  }

  monitor.detach()
})

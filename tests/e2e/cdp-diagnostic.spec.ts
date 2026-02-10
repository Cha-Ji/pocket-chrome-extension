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
import { checkServerHealth, snapshotCandleCount, getCandleCountBySymbol } from './helpers/server-checker'
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
// Step 1.5: DOM 자산 목록 헬스체크
// ─────────────────────────────────────────────────────────
test('CDP Step 1.5: DOM asset list health check', async () => {
  const page = ext.context.pages()[0]!

  const assetInfo = await page.evaluate(() => {
    // PO_PAYOUT_SELECTORS 기준
    const assetItems = document.querySelectorAll('.alist__item')
    const pairTrigger = document.querySelector('.current-symbol')
    const assetList = document.querySelector('.assets-block__alist.alist')

    // 각 자산 항목에서 이름과 페이아웃 추출 (최대 10개만 샘플)
    const samples: { name: string; payout: string }[] = []
    assetItems.forEach((item, i) => {
      if (i >= 10) return
      const label = item.querySelector('.alist__label')
      const profit = item.querySelector('.alist__payout')
      samples.push({
        name: label?.textContent?.trim() || '(no label)',
        payout: profit?.textContent?.trim() || '(no payout)',
      })
    })

    return {
      assetListExists: !!assetList,
      assetCount: assetItems.length,
      currentSymbol: pairTrigger?.textContent?.trim() || '(not found)',
      samples,
    }
  })

  console.log('\n=== DOM Asset List Health Check ===')
  console.log(`Asset list container (.alist): ${assetInfo.assetListExists ? 'FOUND' : 'NOT FOUND'}`)
  console.log(`Total asset items (.alist__item): ${assetInfo.assetCount}`)
  console.log(`Current symbol (.current-symbol): ${assetInfo.currentSymbol}`)

  if (assetInfo.samples.length > 0) {
    console.log(`\nAsset samples (first ${assetInfo.samples.length}):`)
    for (const s of assetInfo.samples) {
      console.log(`  - ${s.name}: ${s.payout}`)
    }
  }

  if (assetInfo.assetCount === 0) {
    console.log('\n  WARNING: No asset items found in DOM.')
    console.log('  → 자산 목록이 비어있으면 AutoMiner가 마이닝 대상을 찾지 못합니다.')
    console.log('  → 페이지가 완전히 로드되었는지, 로그인 상태인지 확인하세요.')
  }

  // 자산이 최소 1개 이상이어야 마이닝 테스트 진행 가능
  expect(
    assetInfo.assetCount,
    'At least one asset item must exist in DOM for mining tests'
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

  // 마이닝 관찰 + 5초 간격 상태 폴링
  console.log(`\nObserving mining pipeline for ${MINE_DURATION / 1000}s (CDP mode)...`)

  const POLL_INTERVAL = 5_000
  const pollCount = Math.floor(MINE_DURATION / POLL_INTERVAL)
  const statusSnapshots: any[] = []
  const assetTransitions: { time: number; from: string | null; to: string | null }[] = []
  let prevAsset: string | null = null

  for (let i = 0; i < pollCount; i++) {
    await page.waitForTimeout(POLL_INTERVAL)

    const status = await page.evaluate(async () => {
      return new Promise<any>((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'GET_MINER_STATUS' }, (res: unknown) => resolve(res))
        } catch (e) {
          resolve({ error: String(e) })
        }
      })
    })

    statusSnapshots.push(status)

    // 자산 전환 감지
    const currentAsset = status?.current ?? null
    if (currentAsset !== prevAsset) {
      assetTransitions.push({
        time: Date.now(),
        from: prevAsset,
        to: currentAsset,
      })
      if (prevAsset !== null) {
        console.log(`  [Poll ${i + 1}] Asset switched: ${prevAsset} → ${currentAsset}`)
      }
      prevAsset = currentAsset
    }

    console.log(
      `  [Poll ${i + 1}/${pollCount}] active=${status?.isActive} current=${currentAsset} ` +
      `completed=${status?.completed ?? 0} failed=${status?.failed ?? 0} ` +
      `candles=${status?.overallCandles ?? 0}`
    )
  }

  // 최종 상태 스냅샷
  const finalStatus = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_MINER_STATUS' }, (res: unknown) => resolve(res))
      } catch (e) {
        resolve({ error: String(e) })
      }
    })
  })

  console.log('\n=== Final Miner Status ===')
  console.log(`Active: ${finalStatus?.isActive}`)
  console.log(`Completed assets: ${finalStatus?.completed ?? 0}`)
  console.log(`Failed assets: ${finalStatus?.failed ?? 0}`)
  console.log(`Overall candles: ${finalStatus?.overallCandles ?? 0}`)
  console.log(`Elapsed: ${finalStatus?.elapsedSeconds ?? 0}s`)
  console.log(`Candles/sec: ${finalStatus?.candlesPerSecond ?? 0}`)
  console.log(`Asset transitions: ${assetTransitions.length}`)

  if (finalStatus?.assetProgress?.length > 0) {
    console.log('\nPer-asset progress:')
    for (const p of finalStatus.assetProgress) {
      console.log(
        `  ${p.asset}: ${p.totalCandles} candles, ${p.daysCollected} days, ` +
        `${p.requestCount} requests, complete=${p.isComplete}`
      )
    }
  }

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
// Step 4.5: 자산별 DB 저장 검증
// ─────────────────────────────────────────────────────────
test('CDP Step 4.5: Verify per-asset candle storage', async () => {
  const page = ext.context.pages()[0]!

  // AutoMiner의 최종 상태에서 완료된 자산 목록 가져오기
  const minerStatus = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_MINER_STATUS' }, (res: unknown) => resolve(res))
      } catch (e) {
        resolve({ error: String(e) })
      }
    })
  })

  const assetProgress: Array<{
    asset: string
    totalCandles: number
    isComplete: boolean
    daysCollected: number
    requestCount: number
  }> = minerStatus?.assetProgress ?? []

  if (assetProgress.length === 0) {
    console.log('\n=== Per-Asset DB Verification ===')
    console.log('No asset progress data available — skipping per-asset verification.')
    console.log('This may indicate AutoMiner did not mine any assets in the previous step.')
    return
  }

  // 완료된 자산과 실패한 자산 분류
  const completedAssets = assetProgress.filter(p => p.totalCandles > 0)
  const emptyAssets = assetProgress.filter(p => p.totalCandles === 0)

  console.log('\n=== Per-Asset DB Verification ===')
  console.log(`Assets with candles: ${completedAssets.length}`)
  console.log(`Assets with 0 candles: ${emptyAssets.length}`)

  // 서버 DB에서 심볼별 캔들 수 조회
  const symbolNames = completedAssets.map(p => p.asset)
  const dbStats = await getCandleCountBySymbol()

  console.log(`\nServer DB has ${dbStats.length} symbols total`)

  // 교차 검증: AutoMiner가 수집했다고 보고한 자산이 실제 DB에 저장되었는지
  if (completedAssets.length > 0) {
    console.log('\n--- Cross-validation: Miner report vs Server DB ---')
    let verifiedCount = 0
    let missingCount = 0

    for (const asset of completedAssets) {
      // 자산 이름 정규화하여 DB 심볼과 매칭
      const normalize = (s: string) =>
        s.toUpperCase().replace(/[\s_-]+/g, '').replace(/OTC$/, 'OTC')
      const normalized = normalize(asset.asset)
      const dbEntry = dbStats.find(s => normalize(s.symbol) === normalized)

      if (dbEntry && dbEntry.count > 0) {
        console.log(
          `  [OK] ${asset.asset}: miner=${asset.totalCandles} candles, ` +
          `db=${dbEntry.count} candles (${dbEntry.days} days)`
        )
        verifiedCount++
      } else {
        console.log(
          `  [MISS] ${asset.asset}: miner reported ${asset.totalCandles} candles, ` +
          `but NOT found in server DB`
        )
        missingCount++
      }
    }

    console.log(`\nVerification result: ${verifiedCount} OK, ${missingCount} missing`)

    if (missingCount > 0) {
      console.log('\n  DIAGNOSIS: Some mined assets are missing from server DB')
      console.log('  → DataSender may have failed to send data to localhost:3001')
      console.log('  → Check Step 4 API call results for failures')
    }
  }

  // 실패한 자산 리포트
  if (emptyAssets.length > 0) {
    console.log('\n--- Assets with 0 candles (failed/skipped) ---')
    for (const asset of emptyAssets) {
      console.log(
        `  ${asset.asset}: ${asset.requestCount} requests, ` +
        `complete=${asset.isComplete}`
      )
    }
  }
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

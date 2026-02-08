import { PayoutMonitor } from './payout-monitor'
import { getWebSocketInterceptor } from './websocket-interceptor'
import { loggers } from '../lib/logger'
import type { CandleData } from './websocket-types'

const log = loggers.miner

// ============================================================
// 벌크 히스토리 수집 설정
// ============================================================

interface BulkMiningConfig {
  offsetSeconds: number    // 한 요청당 과거 범위 (초). 86400 = 24시간 = 1440개 1분봉
  period: number           // 캔들 주기 (60 = 1분봉)
  maxDaysBack: number      // 최대 수집 일수
  requestDelayMs: number   // 응답 후 다음 요청까지 딜레이 (ms)
}

interface AssetMiningProgress {
  asset: string
  totalCandles: number
  oldestTimestamp: number   // 가장 오래된 캔들 시점 (초)
  newestTimestamp: number   // 가장 새로운 캔들 시점 (초)
  requestCount: number
  isComplete: boolean
}

interface MiningState {
  isActive: boolean
  currentAsset: string | null
  completedAssets: Set<string>
  failedAssets: Set<string>
  consecutiveUnavailable: number
  payoutWaitAttempts: number
  config: BulkMiningConfig
  progress: Map<string, AssetMiningProgress>
  // 응답 기반 제어
  pendingRequest: boolean
  retryCount: number
  startedAt: number        // 채굴 시작 시간 (ms)
}

const DEFAULT_CONFIG: BulkMiningConfig = {
  offsetSeconds: 86400,    // 24시간 = 약 1440개 1분봉
  period: 60,              // 1분봉
  maxDaysBack: 30,         // 최대 30일
  requestDelayMs: 500,     // 응답 후 500ms 대기
}

const MAX_RETRIES = 3
const MAX_SWITCH_RETRIES = 2  // 자산 전환 재시도 횟수
const CONSECUTIVE_UNAVAILABLE_THRESHOLD = 5  // 연속 N개 unavailable 시 일시 중단 (3→5 상향)
const MARKET_CLOSED_WAIT_MS = 5 * 60 * 1000  // 시장 닫힘 판단 시 5분 대기
const PAYOUT_WAIT_INTERVAL_MS = 5000  // 페이아웃 데이터 대기 주기
const PAYOUT_MAX_WAIT_ATTEMPTS = 12   // 최대 대기 횟수 (5s × 12 = 60s)
const RESPONSE_TIMEOUT_MS = 15000  // 15초 응답 타임아웃

const minerState: MiningState = {
  isActive: false,
  currentAsset: null,
  completedAssets: new Set(),
  failedAssets: new Set(),
  consecutiveUnavailable: 0,
  payoutWaitAttempts: 0,
  config: { ...DEFAULT_CONFIG },
  progress: new Map(),
  pendingRequest: false,
  retryCount: 0,
  startedAt: 0,
}

let rotationTimeout: ReturnType<typeof setTimeout> | null = null
let responseTimeout: ReturnType<typeof setTimeout> | null = null
let payoutMonitorRef: PayoutMonitor | null = null

// ============================================================
// 자산 ID 결정 헬퍼
// ============================================================

function resolveAssetId(): string {
  // 1순위: WS 발신 메시지에서 캡처된 asset ID (TM ws.send() 후킹)
  const interceptor = getWebSocketInterceptor()
  const trackedId = interceptor.getActiveAssetId()
  if (trackedId) {
    log.info(`📋 Asset ID (WS tracked): ${trackedId}`)
    return trackedId
  }

  // 2순위: DOM에서 asset ID 추출 (PO 페이지의 data 속성)
  const domId = extractAssetIdFromDOM()
  if (domId) {
    log.info(`📋 Asset ID (DOM): ${domId}`)
    return domId
  }

  // 3순위: 이름 기반 fallback (정확하지 않을 수 있음!)
  const asset = minerState.currentAsset || ''
  const fallbackId = asset.toUpperCase().replace(/\s+OTC$/i, '_otc').replace(/\s+/g, '_')
  const result = fallbackId.startsWith('#') ? fallbackId : '#' + fallbackId
  log.warn(`⚠️ Asset ID (FALLBACK - 부정확할 수 있음): ${result}. TM ws.send() 후킹이 필요합니다.`)
  return result
}

/** DOM에서 PO의 실제 asset ID를 추출 시도 */
function extractAssetIdFromDOM(): string | null {
  // 방법 1: 차트 영역의 data 속성
  const chartEl = document.querySelector('.chart-item[data-id], .chart-item[data-asset], [data-active-asset]')
  if (chartEl) {
    const id = chartEl.getAttribute('data-id') || chartEl.getAttribute('data-asset') || chartEl.getAttribute('data-active-asset')
    if (id) return id
  }

  // 방법 2: URL 파라미터에서 asset ID 추출
  const urlParams = new URLSearchParams(window.location.search)
  const urlAsset = urlParams.get('asset') || urlParams.get('symbol')
  if (urlAsset) return urlAsset.startsWith('#') ? urlAsset : '#' + urlAsset

  // 방법 3: PO의 전역 상태에서 추출 (window 객체)
  try {
    const win = window as any
    if (win.__pocketOptionState?.activeAsset) return win.__pocketOptionState.activeAsset
    if (win.CURRENT_ASSET) return win.CURRENT_ASSET
  } catch { /* ignore */ }

  return null
}

// ============================================================
// AutoMiner 모듈
// ============================================================

export const AutoMiner = {
  init(monitor: PayoutMonitor) {
    payoutMonitorRef = monitor
    log.info('Initialized (Bulk History Mode)')
  },

  // ── 시작/중지 ──────────────────────────────────────────

  start() {
    log.info('🚀 Starting Bulk History Mining...')
    minerState.isActive = true
    minerState.completedAssets.clear()
    minerState.failedAssets.clear()
    minerState.consecutiveUnavailable = 0
    minerState.payoutWaitAttempts = 0
    minerState.progress.clear()
    minerState.startedAt = Date.now()
    this.scanAndMineNext()
  },

  stop() {
    log.info('⏹ Stopping mining...')
    minerState.isActive = false
    minerState.pendingRequest = false
    minerState.retryCount = 0
    this.clearTimers()
  },

  // ── 설정 변경 ──────────────────────────────────────────

  updateConfig(partial: Partial<BulkMiningConfig>) {
    Object.assign(minerState.config, partial)
    log.info(`Config updated: offset=${minerState.config.offsetSeconds}s, maxDays=${minerState.config.maxDaysBack}, delay=${minerState.config.requestDelayMs}ms`)
  },

  getConfig() {
    return { ...minerState.config }
  },

  // ── 자산 스캔 및 순회 ──────────────────────────────────

  scanAndMineNext() {
    if (!minerState.isActive || !payoutMonitorRef) return

    // 페이아웃 데이터 로딩 가드 — 데이터 없으면 적극적으로 수집 시도
    if (payoutMonitorRef.getAllAssets().length === 0) {
      minerState.payoutWaitAttempts++
      if (minerState.payoutWaitAttempts > PAYOUT_MAX_WAIT_ATTEMPTS) {
        log.warn('❌ 페이아웃 데이터 60초 대기 초과, 마이닝 중단')
        this.stop()
        return
      }
      log.info(`⏳ 페이아웃 데이터 수집 시도... (${minerState.payoutWaitAttempts}/${PAYOUT_MAX_WAIT_ATTEMPTS})`)
      // 모니터에 강제 수집 요청 후 재확인
      payoutMonitorRef.fetchPayoutsForce().then(() => {
        if (!minerState.isActive) return
        rotationTimeout = setTimeout(() => this.scanAndMineNext(), PAYOUT_WAIT_INTERVAL_MS)
      })
      return
    }
    minerState.payoutWaitAttempts = 0

    const availableAssets = payoutMonitorRef
      .getAvailableAssets()
      .filter(asset => asset.payout >= 92)
      .map(asset => asset.name)

    log.info(`Found ${availableAssets.length} available assets. Completed: ${minerState.completedAssets.size}`)
    const nextAsset = availableAssets.find(asset => !minerState.completedAssets.has(asset))

    if (!nextAsset) {
      log.info('✅ All assets mined! Waiting 1 min before next round...')
      minerState.completedAssets.clear()
      rotationTimeout = setTimeout(() => this.scanAndMineNext(), 60_000)
      return
    }

    log.info(`⛏️ Next Target: ${nextAsset}`)
    this.mineAsset(nextAsset)
  },

  async mineAsset(assetName: string) {
    let switched = false
    for (let attempt = 1; attempt <= MAX_SWITCH_RETRIES; attempt++) {
      switched = await payoutMonitorRef?.switchAsset(assetName) ?? false
      if (switched) break
      // unavailable로 감지된 자산은 재시도 없이 즉시 스킵
      if (payoutMonitorRef?.isAssetUnavailable(assetName)) {
        break
      }
      if (attempt < MAX_SWITCH_RETRIES) {
        log.warn(`Switch attempt ${attempt}/${MAX_SWITCH_RETRIES} failed for ${assetName}, retrying in 3s...`)
        await new Promise(r => setTimeout(r, 3000))
      }
    }
    if (!switched) {
      // 실제 unavailable(asset-inactive)인 경우와 기술적 전환 실패를 구분
      const isActuallyUnavailable = payoutMonitorRef?.isAssetUnavailable(assetName) ?? false

      if (isActuallyUnavailable) {
        log.warn(`⛔ ${assetName} is unavailable, skipping...`)
        minerState.consecutiveUnavailable++
      } else {
        log.warn(`❌ Failed to switch to ${assetName} (technical failure), skipping...`)
        // 기술적 실패는 consecutiveUnavailable 카운터에 반영하지 않음
      }

      minerState.failedAssets.add(assetName)
      minerState.completedAssets.add(assetName)

      // 연속 N개 자산이 실제로 이용 불가 → OTC 시장 닫힘으로 판단, 5분 대기
      if (minerState.consecutiveUnavailable >= CONSECUTIVE_UNAVAILABLE_THRESHOLD) {
        log.warn(`🌙 연속 ${minerState.consecutiveUnavailable}개 자산 이용 불가 — OTC 시장이 닫혀있는 것으로 판단, ${MARKET_CLOSED_WAIT_MS / 60000}분 후 재시도`)
        minerState.completedAssets.clear()
        minerState.failedAssets.clear()
        minerState.consecutiveUnavailable = 0
        rotationTimeout = setTimeout(() => this.scanAndMineNext(), MARKET_CLOSED_WAIT_MS)
        return
      }

      this.scanAndMineNext()
      return
    }

    // 전환 성공 시 연속 실패 카운터 리셋
    minerState.consecutiveUnavailable = 0
    minerState.currentAsset = assetName
    minerState.retryCount = 0

    // 자산 로딩 대기
    await new Promise(r => setTimeout(r, 4000))

    // 진행 상태 초기화
    if (!minerState.progress.has(assetName)) {
      minerState.progress.set(assetName, {
        asset: assetName,
        totalCandles: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
        requestCount: 0,
        isComplete: false,
      })
    }

    // 첫 요청 시작 (응답 기반 연쇄 요청)
    this.requestNextChunk()
  },

  // ── 응답 기반 연쇄 요청 ────────────────────────────────

  requestNextChunk() {
    if (!minerState.isActive || !minerState.currentAsset) return

    const progress = minerState.progress.get(minerState.currentAsset)
    if (!progress) return

    const { config } = minerState
    const assetId = resolveAssetId()

    // 시간 기준점: 첫 요청이면 현재 시간, 이후에는 가장 오래된 캔들 기준
    const timeBase = progress.oldestTimestamp > 0
      ? progress.oldestTimestamp
      : Math.floor(Date.now() / 1000)

    // 최대 과거 한도 체크
    const maxPast = Math.floor(Date.now() / 1000) - (config.maxDaysBack * 86400)
    if (timeBase <= maxPast) {
      log.info(`📊 ${minerState.currentAsset}: 최대 ${config.maxDaysBack}일 도달, 자산 완료`)
      progress.isComplete = true
      minerState.completedAssets.add(minerState.currentAsset)
      this.scanAndMineNext()
      return
    }

    const index = timeBase * 100 + Math.floor(Math.random() * 100)
    const interceptor = getWebSocketInterceptor()

    log.info(`📤 ${assetId} | time=${new Date(timeBase * 1000).toISOString().slice(0, 16)} | offset=${config.offsetSeconds}s | req#${progress.requestCount + 1}`)

    interceptor.send(
      `42["loadHistoryPeriod",{"asset":"${assetId}","index":${index},"time":${timeBase},"offset":${config.offsetSeconds},"period":${config.period}}]`
    )

    minerState.pendingRequest = true
    progress.requestCount++

    // 응답 타임아웃 설정
    this.startResponseTimeout()
  },

  // ── 히스토리 응답 수신 (index.ts에서 호출) ─────────────

  onHistoryResponse(candles: CandleData[]) {
    if (!minerState.isActive || !minerState.currentAsset) return
    if (!minerState.pendingRequest) return  // 내가 요청한 것이 아니면 무시

    minerState.pendingRequest = false
    minerState.retryCount = 0
    this.clearResponseTimeout()

    const progress = minerState.progress.get(minerState.currentAsset)
    if (!progress) return

    // 빈 응답 또는 극소량 → 해당 자산 데이터 끝
    if (!candles || candles.length < 10) {
      log.info(`📊 ${minerState.currentAsset}: 데이터 끝 도달 (받은 캔들: ${candles?.length || 0}), 총 ${progress.totalCandles}개 수집 완료`)
      progress.isComplete = true
      minerState.completedAssets.add(minerState.currentAsset)
      this.scanAndMineNext()
      return
    }

    // 진행 상태 업데이트
    progress.totalCandles += candles.length

    const timestamps = candles.map(c => {
      const ts = Number(c.timestamp)
      // 밀리초인 경우 초 단위로 변환
      return ts > 9999999999 ? Math.floor(ts / 1000) : ts
    }).filter(ts => ts > 0)

    if (timestamps.length > 0) {
      const oldestInBatch = Math.min(...timestamps)
      const newestInBatch = Math.max(...timestamps)
      if (progress.oldestTimestamp === 0 || oldestInBatch < progress.oldestTimestamp) {
        progress.oldestTimestamp = oldestInBatch
      }
      if (progress.newestTimestamp === 0 || newestInBatch > progress.newestTimestamp) {
        progress.newestTimestamp = newestInBatch
      }
    }

    const daysCollected = progress.newestTimestamp > 0 && progress.oldestTimestamp > 0
      ? ((progress.newestTimestamp - progress.oldestTimestamp) / 86400).toFixed(1)
      : '0'

    log.info(`✅ ${minerState.currentAsset}: +${candles.length} (총 ${progress.totalCandles}개, ${daysCollected}일)`)

    // 다음 청크 요청 (딜레이 후)
    rotationTimeout = setTimeout(() => {
      this.requestNextChunk()
    }, minerState.config.requestDelayMs)
  },

  // ── 응답 타임아웃 ──────────────────────────────────────

  startResponseTimeout() {
    this.clearResponseTimeout()
    responseTimeout = setTimeout(() => {
      if (!minerState.pendingRequest || !minerState.isActive) return

      minerState.retryCount++
      minerState.pendingRequest = false

      if (minerState.retryCount >= MAX_RETRIES) {
        log.warn(`⚠️ ${minerState.currentAsset}: ${MAX_RETRIES}회 타임아웃, 다음 자산으로 이동`)
        if (minerState.currentAsset) {
          minerState.completedAssets.add(minerState.currentAsset)
        }
        minerState.retryCount = 0
        this.scanAndMineNext()
      } else {
        log.warn(`⏱️ ${minerState.currentAsset}: 응답 타임아웃 (${minerState.retryCount}/${MAX_RETRIES}), 재시도...`)
        this.requestNextChunk()
      }
    }, RESPONSE_TIMEOUT_MS)
  },

  clearResponseTimeout() {
    if (responseTimeout) { clearTimeout(responseTimeout); responseTimeout = null }
  },

  clearTimers() {
    if (rotationTimeout) { clearTimeout(rotationTimeout); rotationTimeout = null }
    this.clearResponseTimeout()
  },

  // ── 상태 조회 ──────────────────────────────────────────

  getStatus() {
    const assetProgress = Array.from(minerState.progress.values()).map(p => ({
      asset: p.asset,
      totalCandles: p.totalCandles,
      daysCollected: p.newestTimestamp > 0 && p.oldestTimestamp > 0
        ? Math.round((p.newestTimestamp - p.oldestTimestamp) / 86400 * 10) / 10
        : 0,
      isComplete: p.isComplete,
      requestCount: p.requestCount,
    }))

    const overallCandles = assetProgress.reduce((sum, p) => sum + p.totalCandles, 0)
    const elapsedSeconds = minerState.startedAt > 0
      ? Math.round((Date.now() - minerState.startedAt) / 1000)
      : 0

    return {
      isActive: minerState.isActive,
      current: minerState.currentAsset,
      completed: minerState.completedAssets.size - minerState.failedAssets.size,
      failed: minerState.failedAssets.size,
      total: minerState.completedAssets.size,
      assetProgress,
      overallCandles,
      elapsedSeconds,
      candlesPerSecond: elapsedSeconds > 0 ? Math.round(overallCandles / elapsedSeconds) : 0,
      config: { ...minerState.config },
    }
  },
}

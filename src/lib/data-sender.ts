// ============================================================
// Data Sender (to Local Collector)
// ============================================================
// 역할: 수집된 캔들을 로컬 서버로 전송
// 설정: appConfig.dataSender (enabled, serverUrl, retry 등)
// ============================================================

import { loggers } from './logger'
import { DataSenderConfig, DEFAULT_DATA_SENDER_CONFIG } from './config'

const log = loggers.dataSender

/** DataSender 전송 통계 */
export interface DataSenderStats {
  serverOnline: boolean
  lastHealthCheck: number
  bulkSendCount: number
  bulkSuccessCount: number
  bulkFailCount: number
  bulkTotalCandles: number
  lastBulkSendAt: number
  realtimeSendCount: number
  realtimeSuccessCount: number
  realtimeFailCount: number
  consecutiveFailures: number
}

const senderStats: DataSenderStats = {
  serverOnline: false,
  lastHealthCheck: 0,
  bulkSendCount: 0,
  bulkSuccessCount: 0,
  bulkFailCount: 0,
  bulkTotalCandles: 0,
  lastBulkSendAt: 0,
  realtimeSendCount: 0,
  realtimeSuccessCount: 0,
  realtimeFailCount: 0,
  consecutiveFailures: 0,
}

/** Loose candle shape accepted by DataSender (symbol or ticker) */
export interface CandleLike {
  symbol?: string
  ticker?: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// ── 설정 관리 ──────────────────────────────────────────────

let config: DataSenderConfig = { ...DEFAULT_DATA_SENDER_CONFIG }

function getServerUrl(): string {
  return config.serverUrl
}

function isEnabled(): boolean {
  return config.enabled
}

/**
 * 연속 실패 횟수에 따라 에러 로그를 출력할지 판단.
 * threshold 이하면 매번 출력, 초과하면 10번째마다 출력.
 */
function shouldLogError(): boolean {
  const n = senderStats.consecutiveFailures
  if (n <= config.errorLogThrottleAfter) return true
  return n % 10 === 0
}

function logThrottled(message: string): void {
  if (shouldLogError()) {
    const suppressed = senderStats.consecutiveFailures > config.errorLogThrottleAfter
    const suffix = suppressed
      ? ` (suppressing further logs, failures: ${senderStats.consecutiveFailures})`
      : ''
    log.fail(`${message}${suffix}`)
  }
}

// ── 지수 백오프 헬퍼 ─────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number,
  baseMs: number,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init)
      return response
    } catch (error: unknown) {
      lastError = error
      if (attempt < maxRetries) {
        const delay = baseMs * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }
  throw lastError
}

// ── Public API ────────────────────────────────────────────

export const DataSender = {
  /**
   * 설정 주입 (앱 초기화 시 또는 동적 변경 시 호출)
   */
  configure(newConfig: Partial<DataSenderConfig>): void {
    config = { ...config, ...newConfig }
  },

  /**
   * 현재 설정 스냅샷 반환
   */
  getConfig(): DataSenderConfig {
    return { ...config }
  },

  /**
   * 서버 상태 확인
   */
  async checkHealth(): Promise<boolean> {
    if (!isEnabled()) return false

    try {
      const res = await fetch(`${getServerUrl()}/health`)
      senderStats.serverOnline = res.ok
      senderStats.lastHealthCheck = Date.now()
      if (res.ok) senderStats.consecutiveFailures = 0
      return res.ok
    } catch {
      senderStats.serverOnline = false
      senderStats.lastHealthCheck = Date.now()
      return false
    }
  },

  /**
   * 실시간 캔들 전송
   */
  async sendCandle(candle: CandleLike): Promise<void> {
    if (!isEnabled()) return

    senderStats.realtimeSendCount++
    try {
      const payload = {
        symbol: candle.symbol || candle.ticker || 'UNKNOWN',
        interval: '1m',
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
        source: 'realtime',
      }

      log.debug(`Sending candle: ${payload.symbol} @ ${payload.timestamp}`)

      const response = await fetch(`${getServerUrl()}/api/candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        senderStats.realtimeSuccessCount++
        senderStats.consecutiveFailures = 0
      } else {
        senderStats.realtimeFailCount++
        senderStats.consecutiveFailures++
        const errorText = await response.text()
        logThrottled(`Server error (${response.status}): ${errorText}`)
      }
    } catch (error: unknown) {
      senderStats.realtimeFailCount++
      senderStats.consecutiveFailures++
      logThrottled(`Network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  },

  /**
   * 과거 데이터 Bulk 전송 (재시도 + 지수 백오프)
   */
  async sendHistory(candles: CandleLike[]): Promise<void> {
    if (candles.length === 0) return
    if (!isEnabled()) return

    try {
      const firstCandle = candles[0]
      const symbol = firstCandle.symbol || firstCandle.ticker || 'UNKNOWN'
      log.data(`Attempting bulk send: ${candles.length} candles for ${symbol}`)

      const mapped = candles
        .map((c) => ({
          symbol: (c.symbol || c.ticker || symbol).toUpperCase().replace(/\s+/g, '-'),
          interval: '1m',
          timestamp: Number(c.timestamp),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0),
          source: 'history',
        }))
        .filter(
          (c) =>
            c.symbol &&
            c.symbol !== 'UNKNOWN' &&
            !isNaN(c.timestamp) &&
            c.timestamp > 0 &&
            !isNaN(c.open) &&
            !isNaN(c.high) &&
            !isNaN(c.low) &&
            !isNaN(c.close)
        )

      if (mapped.length === 0) {
        log.fail(
          `All ${candles.length} candles filtered out during validation. Sample: ${JSON.stringify(candles[0])}`
        )
        return
      }

      if (mapped.length !== candles.length) {
        log.data(`Filtered: ${candles.length} → ${mapped.length} candles (${candles.length - mapped.length} invalid)`)
      }

      const payload = { candles: mapped }
      const bodyStr = JSON.stringify(payload)
      const serverUrl = getServerUrl()
      log.data(`Sending ${mapped.length} candles (${(bodyStr.length / 1024).toFixed(1)}KB) to ${serverUrl}/api/candles/bulk`)

      // 카운터는 실제 전송 시도 직전에 증가
      senderStats.bulkSendCount++

      const response = await fetchWithRetry(
        `${serverUrl}/api/candles/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        },
        config.bulkMaxRetries,
        config.bulkRetryBaseMs,
      )

      if (response.ok) {
        const result = await response.json()
        senderStats.bulkSuccessCount++
        senderStats.bulkTotalCandles += result.count
        senderStats.lastBulkSendAt = Date.now()
        senderStats.consecutiveFailures = 0
        log.success(`Bulk saved: ${result.count} candles (symbol: ${mapped[0].symbol})`)
      } else {
        senderStats.bulkFailCount++
        senderStats.consecutiveFailures++
        const errorText = await response.text()
        logThrottled(`Bulk send failed (HTTP ${response.status}): ${errorText}`)
      }
    } catch (error: unknown) {
      senderStats.bulkFailCount++
      senderStats.consecutiveFailures++
      logThrottled(`Bulk send network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  },

  /** 전송 통계 스냅샷 반환 */
  getStats(): DataSenderStats {
    return { ...senderStats }
  },

  /** 통계 리셋 (테스트용) */
  _resetStats(): void {
    Object.assign(senderStats, {
      serverOnline: false,
      lastHealthCheck: 0,
      bulkSendCount: 0,
      bulkSuccessCount: 0,
      bulkFailCount: 0,
      bulkTotalCandles: 0,
      lastBulkSendAt: 0,
      realtimeSendCount: 0,
      realtimeSuccessCount: 0,
      realtimeFailCount: 0,
      consecutiveFailures: 0,
    })
  },
}

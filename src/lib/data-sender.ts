// ============================================================
// Data Sender (to Local Collector)
// ============================================================
// 역할: 수집된 캔들을 로컬 서버로 전송
// ============================================================

import { loggers } from './logger'

const log = loggers.dataSender
const SERVER_URL = 'http://localhost:3001'

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

export const DataSender = {
  /**
   * 서버 상태 확인
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${SERVER_URL}/health`)
      senderStats.serverOnline = res.ok
      senderStats.lastHealthCheck = Date.now()
      return res.ok
    } catch (e) {
      senderStats.serverOnline = false
      senderStats.lastHealthCheck = Date.now()
      return false
    }
  },

  /**
   * 실시간 캔들 전송
   */
  async sendCandle(candle: CandleLike): Promise<void> {
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
        source: 'realtime'
      }

      log.debug(`Sending candle: ${payload.symbol} @ ${payload.timestamp}`)

      const response = await fetch(`${SERVER_URL}/api/candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        senderStats.realtimeSuccessCount++
      } else {
        senderStats.realtimeFailCount++
        const errorText = await response.text();
        log.error(`Server error (${response.status}): ${errorText}`)
      }

    } catch (error: unknown) {
      senderStats.realtimeFailCount++
      log.error(`Network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  },

  /**
   * 과거 데이터 Bulk 전송
   */
  async sendHistory(candles: CandleLike[]): Promise<void> {
    if (candles.length === 0) return

    senderStats.bulkSendCount++
    try {
      const firstCandle = candles[0];
      const symbol = firstCandle.symbol || firstCandle.ticker || 'UNKNOWN';
      log.data(`Attempting bulk send: ${candles.length} candles for ${symbol}`)

      const mapped = candles.map(c => ({
        symbol: (c.symbol || c.ticker || symbol).toUpperCase().replace(/\s+/g, '-'),
        interval: '1m',
        timestamp: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
        source: 'history'
      })).filter(c =>
        c.symbol && c.symbol !== 'UNKNOWN' &&
        !isNaN(c.timestamp) && c.timestamp > 0 &&
        !isNaN(c.open) &&
        !isNaN(c.high) &&
        !isNaN(c.low) &&
        !isNaN(c.close)
      )

      if (mapped.length === 0) {
        senderStats.bulkFailCount++
        log.fail(`All ${candles.length} candles filtered out during validation. Sample: ${JSON.stringify(candles[0])}`)
        return
      }

      if (mapped.length !== candles.length) {
        log.data(`Filtered: ${candles.length} → ${mapped.length} candles (${candles.length - mapped.length} invalid)`)
      }

      const payload = { candles: mapped }
      const bodyStr = JSON.stringify(payload)
      log.data(`Sending ${mapped.length} candles (${(bodyStr.length / 1024).toFixed(1)}KB) to ${SERVER_URL}/api/candles/bulk`)

      const response = await fetch(`${SERVER_URL}/api/candles/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      })

      if (response.ok) {
        const result = await response.json();
        senderStats.bulkSuccessCount++
        senderStats.bulkTotalCandles += result.count
        senderStats.lastBulkSendAt = Date.now()
        log.success(`Bulk saved: ${result.count} candles (symbol: ${mapped[0].symbol})`)
      } else {
        senderStats.bulkFailCount++
        const errorText = await response.text();
        log.fail(`Bulk send failed (HTTP ${response.status}): ${errorText}`)
      }
    } catch (error: unknown) {
      senderStats.bulkFailCount++
      log.fail(`Bulk send network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  },

  /** 전송 통계 스냅샷 반환 */
  getStats(): DataSenderStats {
    return { ...senderStats }
  },
}

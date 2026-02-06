// ============================================================
// Data Sender (to Local Collector)
// ============================================================
// 역할: 수집된 캔들을 로컬 서버로 전송
// ============================================================

import { loggers } from './logger'

const log = loggers.dataSender
const SERVER_URL = 'http://localhost:3001'

export const DataSender = {
  /**
   * 서버 상태 확인
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${SERVER_URL}/health`)
      return res.ok
    } catch (e) {
      return false
    }
  },

  /**
   * 실시간 캔들 전송
   */
  async sendCandle(candle: any): Promise<void> {
    try {
      // 1. 필요한 필드만 추출 및 변환
      const payload = {
        symbol: candle.symbol || candle.ticker || 'UNKNOWN',
        interval: '1m', // 일단 1분봉 고정 (추후 동적 처리)
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
        source: 'realtime'
      }

      log.debug(`Sending candle: ${payload.symbol} @ ${payload.timestamp}`)

      // 2. 전송 (비동기, 결과 기다리지 않음)
      const response = await fetch(`${SERVER_URL}/api/candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Server error (${response.status}): ${errorText}`)
      }

    } catch (error: any) {
      log.error(`Network error: ${error.message}`)
    }
  },

  /**
   * 과거 데이터 Bulk 전송
   */
  async sendHistory(candles: any[]): Promise<void> {
    if (candles.length === 0) return

    try {
      const firstCandle = candles[0];
      const symbol = firstCandle.symbol || firstCandle.ticker || 'UNKNOWN';
      log.data(`Attempting bulk send: ${candles.length} candles for ${symbol}`)

      const mapped = candles.map(c => ({
        symbol: (c.symbol || c.ticker || symbol).toUpperCase().replace(/\s+/g, '-'), // 서버 표준 포맷 강제
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
        log.success(`Bulk saved: ${result.count} candles (symbol: ${mapped[0].symbol})`)
      } else {
        const errorText = await response.text();
        log.fail(`Bulk send failed (HTTP ${response.status}): ${errorText}`)
      }
    } catch (error: any) {
      log.fail(`Bulk send network error: ${error.message}`)
    }
  }
}

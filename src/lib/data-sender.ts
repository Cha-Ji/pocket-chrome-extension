// ============================================================
// Data Sender (to Local Collector)
// ============================================================
// 역할: 수집된 캔들을 로컬 서버로 전송
// ============================================================

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
        symbol: candle.ticker,
        interval: '1m', // 일단 1분봉 고정 (추후 동적 처리)
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
        source: 'realtime'
      }

      // 2. 전송 (비동기, 결과 기다리지 않음)
      fetch(`${SERVER_URL}/api/candle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error('Failed to send candle:', err))

    } catch (error) {
      console.error('DataSender error:', error)
    }
  },

  /**
   * 과거 데이터 Bulk 전송
   */
  async sendHistory(candles: any[]): Promise<void> {
    if (candles.length === 0) return

    try {
      const payload = {
        candles: candles.map(c => ({
          symbol: c.ticker,
          interval: '1m',
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 0,
          source: 'history'
        }))
      }

      await fetch(`${SERVER_URL}/api/candles/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      console.log(`Sent ${candles.length} history candles to collector`)
    } catch (error) {
      console.error('Failed to send history:', error)
    }
  }
}

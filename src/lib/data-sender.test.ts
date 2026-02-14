import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock logger before importing DataSender
vi.mock('./logger', () => ({
  loggers: {
    dataSender: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      data: vi.fn(),
      success: vi.fn(),
      fail: vi.fn(),
    },
  },
}))

// Mock config module
vi.mock('./config', () => ({
  DEFAULT_DATA_SENDER_CONFIG: {
    enabled: false,
    serverUrl: 'http://localhost:3001',
    errorLogThrottleAfter: 3,
    bulkMaxRetries: 0, // 테스트에서는 재시도 없음
    bulkRetryBaseMs: 10,
  },
}))

import { DataSender } from './data-sender'
import type { CandleLike } from './data-sender'

describe('DataSender', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    DataSender._resetStats()
    // 모든 테스트에서 활성화 (개별 테스트에서 비활성 테스트)
    DataSender.configure({
      enabled: true,
      serverUrl: 'http://localhost:3001',
      errorLogThrottleAfter: 3,
      bulkMaxRetries: 0,
      bulkRetryBaseMs: 10,
    })
  })

  // ============================================================
  // configure / getConfig
  // ============================================================
  describe('configure', () => {
    it('설정을 부분 업데이트한다', () => {
      DataSender.configure({ serverUrl: 'http://example.com:9090' })
      const cfg = DataSender.getConfig()
      expect(cfg.serverUrl).toBe('http://example.com:9090')
      expect(cfg.enabled).toBe(true) // 이전 값 유지
    })
  })

  // ============================================================
  // enabled=false 가드
  // ============================================================
  describe('enabled=false guard', () => {
    beforeEach(() => {
      DataSender.configure({ enabled: false })
    })

    it('checkHealth는 fetch 없이 false를 반환한다', async () => {
      globalThis.fetch = vi.fn()
      const result = await DataSender.checkHealth()
      expect(result).toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('sendCandle은 fetch하지 않는다', async () => {
      globalThis.fetch = vi.fn()
      await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('sendHistory는 fetch하지 않는다', async () => {
      globalThis.fetch = vi.fn()
      await DataSender.sendHistory([
        { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178 },
      ])
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // checkHealth
  // ============================================================
  describe('checkHealth', () => {
    it('서버가 정상이면 true를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      const result = await DataSender.checkHealth()
      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith('http://localhost:3001/health')
    })

    it('서버가 비정상이면 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

      const result = await DataSender.checkHealth()
      expect(result).toBe(false)
    })

    it('네트워크 에러 시 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await DataSender.checkHealth()
      expect(result).toBe(false)
    })

    it('stats의 serverOnline 상태를 업데이트한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      await DataSender.checkHealth()

      const stats = DataSender.getStats()
      expect(stats.serverOnline).toBe(true)
      expect(stats.lastHealthCheck).toBeGreaterThan(0)
    })
  })

  // ============================================================
  // sendCandle
  // ============================================================
  describe('sendCandle', () => {
    const candle: CandleLike = {
      symbol: 'BTCUSDT',
      timestamp: 1700000000000,
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
      volume: 100,
    }

    it('캔들을 서버로 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await DataSender.sendCandle(candle)

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/candle',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.symbol).toBe('BTCUSDT')
      expect(body.open).toBe(50000)
      expect(body.source).toBe('realtime')
    })

    it('ticker 필드를 symbol로 사용한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await DataSender.sendCandle({ ticker: 'AAPL', timestamp: 1, open: 1, high: 1, low: 1, close: 1 })

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.symbol).toBe('AAPL')
    })

    it('symbol과 ticker 모두 없으면 UNKNOWN', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 })

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.symbol).toBe('UNKNOWN')
    })

    it('서버 에러 시 realtimeFailCount를 증가시킨다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      })

      await DataSender.sendCandle(candle)

      const stats = DataSender.getStats()
      expect(stats.realtimeFailCount).toBe(1)
    })

    it('네트워크 에러 시 realtimeFailCount를 증가시킨다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      await DataSender.sendCandle(candle)

      const stats = DataSender.getStats()
      expect(stats.realtimeFailCount).toBe(1)
    })

    it('성공 시 realtimeSuccessCount를 증가시킨다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

      await DataSender.sendCandle(candle)

      expect(DataSender.getStats().realtimeSuccessCount).toBe(1)
    })
  })

  // ============================================================
  // sendHistory
  // ============================================================
  describe('sendHistory', () => {
    const candles: CandleLike[] = [
      { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178, volume: 500 },
      { symbol: 'AAPL', timestamp: 1700000060000, open: 178, high: 182, low: 176, close: 180, volume: 600 },
    ]

    it('빈 배열이면 전송하지 않고 카운터도 변경하지 않는다', async () => {
      globalThis.fetch = vi.fn()
      await DataSender.sendHistory([])
      expect(fetch).not.toHaveBeenCalled()
      expect(DataSender.getStats().bulkSendCount).toBe(0)
    })

    it('벌크 캔들을 서버로 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 2 }),
      })

      await DataSender.sendHistory(candles)

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/candles/bulk',
        expect.objectContaining({ method: 'POST' })
      )

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.candles).toHaveLength(2)
      expect(body.candles[0].source).toBe('history')
    })

    it('symbol을 대문자로 변환하고 공백을 하이픈으로 바꾼다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      })

      await DataSender.sendHistory([
        { symbol: 'aapl otc', timestamp: 1700000000000, open: 1, high: 1, low: 1, close: 1 },
      ])

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.candles[0].symbol).toBe('AAPL-OTC')
    })

    it('유효하지 않은 캔들을 필터링한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      })

      await DataSender.sendHistory([
        { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178 },
        { symbol: 'UNKNOWN', timestamp: NaN, open: NaN, high: NaN, low: NaN, close: NaN },
      ])

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.candles).toHaveLength(1)
    })

    it('모든 캔들이 필터링되면 전송하지 않고 bulkSendCount도 증가하지 않는다', async () => {
      globalThis.fetch = vi.fn()

      await DataSender.sendHistory([
        { symbol: 'UNKNOWN', timestamp: NaN, open: NaN, high: NaN, low: NaN, close: NaN },
      ])

      expect(fetch).not.toHaveBeenCalled()
      expect(DataSender.getStats().bulkSendCount).toBe(0)
    })

    it('서버 에러 시 bulkFailCount를 증가시킨다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      })

      await DataSender.sendHistory(candles)
      expect(DataSender.getStats().bulkFailCount).toBe(1)
    })

    it('네트워크 에러 시 bulkFailCount를 증가시킨다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

      await DataSender.sendHistory(candles)
      expect(DataSender.getStats().bulkFailCount).toBe(1)
    })

    it('성공 시 bulkSuccessCount와 bulkTotalCandles를 업데이트한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 2 }),
      })

      await DataSender.sendHistory(candles)

      const stats = DataSender.getStats()
      expect(stats.bulkSuccessCount).toBe(1)
      expect(stats.bulkTotalCandles).toBe(2)
      expect(stats.lastBulkSendAt).toBeGreaterThan(0)
    })

    it('ticker 필드를 symbol로 사용한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      })

      await DataSender.sendHistory([
        { ticker: 'GOOG', timestamp: 1700000000000, open: 140, high: 145, low: 138, close: 142 },
      ])

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.candles[0].symbol).toBe('GOOG')
    })

    it('설정된 serverUrl을 사용한다', async () => {
      DataSender.configure({ serverUrl: 'http://custom:9090' })
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 2 }),
      })

      await DataSender.sendHistory(candles)

      expect(fetch).toHaveBeenCalledWith(
        'http://custom:9090/api/candles/bulk',
        expect.any(Object)
      )
    })
  })

  // ============================================================
  // retry with backoff
  // ============================================================
  describe('bulk retry', () => {
    const candles: CandleLike[] = [
      { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178 },
    ]

    it('네트워크 에러 시 재시도한다 (bulkMaxRetries=2)', async () => {
      DataSender.configure({ bulkMaxRetries: 2, bulkRetryBaseMs: 1 })
      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ count: 1 }) })

      await DataSender.sendHistory(candles)

      expect(fetch).toHaveBeenCalledTimes(3)
      expect(DataSender.getStats().bulkSuccessCount).toBe(1)
    })

    it('모든 재시도 실패 시 bulkFailCount가 증가한다', async () => {
      DataSender.configure({ bulkMaxRetries: 1, bulkRetryBaseMs: 1 })
      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))

      await DataSender.sendHistory(candles)

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(DataSender.getStats().bulkFailCount).toBe(1)
    })
  })

  // ============================================================
  // error log throttling
  // ============================================================
  describe('error log throttling', () => {
    it('연속 실패 임계값 초과 시 10번째마다만 로그한다', async () => {
      const { loggers } = await import('./logger')
      const failFn = loggers.dataSender.fail as ReturnType<typeof vi.fn>

      DataSender.configure({ errorLogThrottleAfter: 2 })

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'))

      // 5번 연속 실패
      for (let i = 0; i < 5; i++) {
        await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 })
      }

      // 1번째, 2번째 = 임계값 이하로 매번 로그
      // 3번째, 4번째, 5번째 = 임계값 초과 → 10번째마다만
      // consecutiveFailures: 1→log, 2→log, 3→no, 4→no, 5→no
      // 정확히는: n<=2면 로그, n>2이고 n%10==0이면 로그
      // n=1: log, n=2: log, n=3: no, n=4: no, n=5: no
      expect(failFn.mock.calls.length).toBe(2)
    })
  })

  // ============================================================
  // getStats
  // ============================================================
  describe('getStats', () => {
    it('통계 스냅샷을 반환한다 (복사본)', () => {
      const stats1 = DataSender.getStats()
      const stats2 = DataSender.getStats()
      expect(stats1).not.toBe(stats2) // 다른 참조
      expect(stats1).toEqual(stats2) // 같은 값
    })

    it('consecutiveFailures를 추적한다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'))
      await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 })
      expect(DataSender.getStats().consecutiveFailures).toBe(1)

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 })
      expect(DataSender.getStats().consecutiveFailures).toBe(0)
    })
  })
})

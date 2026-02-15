import { describe, it, expect, beforeEach, vi } from 'vitest';

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
}));

import { DataSender } from './data-sender';
import type { CandleLike } from './data-sender';

describe('DataSender', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // checkHealth
  // ============================================================
  describe('checkHealth', () => {
    it('서버가 정상이면 true를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await DataSender.checkHealth();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3001/health');
    });

    it('서버가 비정상이면 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

      const result = await DataSender.checkHealth();
      expect(result).toBe(false);
    });

    it('네트워크 에러 시 false를 반환한다', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await DataSender.checkHealth();
      expect(result).toBe(false);
    });

    it('stats의 serverOnline 상태를 업데이트한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      await DataSender.checkHealth();

      const stats = DataSender.getStats();
      expect(stats.serverOnline).toBe(true);
      expect(stats.lastHealthCheck).toBeGreaterThan(0);
    });
  });

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
    };

    it('캔들을 서버로 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await DataSender.sendCandle(candle);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/candle',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.symbol).toBe('BTCUSDT');
      expect(body.open).toBe(50000);
      expect(body.source).toBe('realtime');
    });

    it('ticker 필드를 symbol로 사용한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await DataSender.sendCandle({
        ticker: 'AAPL',
        timestamp: 1,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
      });

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.symbol).toBe('AAPL');
    });

    it('symbol과 ticker 모두 없으면 UNKNOWN', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await DataSender.sendCandle({ timestamp: 1, open: 1, high: 1, low: 1, close: 1 });

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.symbol).toBe('UNKNOWN');
    });

    it('서버 에러 시 realtimeFailCount를 증가시킨다', async () => {
      const statsBefore = DataSender.getStats();
      const failBefore = statsBefore.realtimeFailCount;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      });

      await DataSender.sendCandle(candle);

      const statsAfter = DataSender.getStats();
      expect(statsAfter.realtimeFailCount).toBe(failBefore + 1);
    });

    it('네트워크 에러 시 realtimeFailCount를 증가시킨다', async () => {
      const statsBefore = DataSender.getStats();
      const failBefore = statsBefore.realtimeFailCount;

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await DataSender.sendCandle(candle);

      const statsAfter = DataSender.getStats();
      expect(statsAfter.realtimeFailCount).toBe(failBefore + 1);
    });

    it('성공 시 realtimeSuccessCount를 증가시킨다', async () => {
      const statsBefore = DataSender.getStats();
      const successBefore = statsBefore.realtimeSuccessCount;

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await DataSender.sendCandle(candle);

      expect(DataSender.getStats().realtimeSuccessCount).toBe(successBefore + 1);
    });
  });

  // ============================================================
  // sendHistory
  // ============================================================
  describe('sendHistory', () => {
    const candles: CandleLike[] = [
      {
        symbol: 'AAPL',
        timestamp: 1700000000000,
        open: 175,
        high: 180,
        low: 170,
        close: 178,
        volume: 500,
      },
      {
        symbol: 'AAPL',
        timestamp: 1700000060000,
        open: 178,
        high: 182,
        low: 176,
        close: 180,
        volume: 600,
      },
    ];

    it('빈 배열이면 전송하지 않는다', async () => {
      globalThis.fetch = vi.fn();
      await DataSender.sendHistory([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('벌크 캔들을 서버로 전송한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 2 }),
      });

      await DataSender.sendHistory(candles);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/candles/bulk',
        expect.objectContaining({ method: 'POST' }),
      );

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.candles).toHaveLength(2);
      expect(body.candles[0].source).toBe('history');
    });

    it('symbol을 대문자로 변환하고 공백을 하이픈으로 바꾼다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      });

      await DataSender.sendHistory([
        { symbol: 'aapl otc', timestamp: 1700000000000, open: 1, high: 1, low: 1, close: 1 },
      ]);

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.candles[0].symbol).toBe('AAPL-OTC');
    });

    it('유효하지 않은 캔들을 필터링한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      });

      await DataSender.sendHistory([
        { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178 },
        { symbol: 'UNKNOWN', timestamp: NaN, open: NaN, high: NaN, low: NaN, close: NaN },
      ]);

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.candles).toHaveLength(1);
    });

    it('모든 캔들이 필터링되면 전송하지 않는다', async () => {
      globalThis.fetch = vi.fn();

      await DataSender.sendHistory([
        { symbol: 'UNKNOWN', timestamp: NaN, open: NaN, high: NaN, low: NaN, close: NaN },
      ]);

      expect(fetch).not.toHaveBeenCalled();
    });

    it('서버 에러 시 bulkFailCount를 증가시킨다', async () => {
      const before = DataSender.getStats().bulkFailCount;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Error'),
      });

      await DataSender.sendHistory(candles);
      expect(DataSender.getStats().bulkFailCount).toBe(before + 1);
    });

    it('네트워크 에러 시 bulkFailCount를 증가시킨다', async () => {
      const before = DataSender.getStats().bulkFailCount;

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

      // Use maxRetries=0 to avoid retry delays in test
      await DataSender.sendHistory(candles, 0);
      expect(DataSender.getStats().bulkFailCount).toBe(before + 1);
    });

    it('성공 시 bulkSuccessCount와 bulkTotalCandles를 업데이트한다', async () => {
      const before = DataSender.getStats();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 2 }),
      });

      await DataSender.sendHistory(candles);

      const after = DataSender.getStats();
      expect(after.bulkSuccessCount).toBe(before.bulkSuccessCount + 1);
      expect(after.bulkTotalCandles).toBe(before.bulkTotalCandles + 2);
      expect(after.lastBulkSendAt).toBeGreaterThan(0);
    });

    it('ticker 필드를 symbol로 사용한다', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      });

      await DataSender.sendHistory([
        { ticker: 'GOOG', timestamp: 1700000000000, open: 140, high: 145, low: 138, close: 142 },
      ]);

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.candles[0].symbol).toBe('GOOG');
    });

    it('bulkSendCount는 유효한 캔들이 있을 때만 증가한다', async () => {
      const before = DataSender.getStats().bulkSendCount;

      // All invalid candles → filtered out → no count increment
      globalThis.fetch = vi.fn();
      await DataSender.sendHistory([
        { symbol: 'UNKNOWN', timestamp: NaN, open: NaN, high: NaN, low: NaN, close: NaN },
      ]);
      expect(DataSender.getStats().bulkSendCount).toBe(before);

      // Valid candles → count increments
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ count: 1 }),
      });
      await DataSender.sendHistory([
        { symbol: 'AAPL', timestamp: 1700000000000, open: 175, high: 180, low: 170, close: 178 },
      ]);
      expect(DataSender.getStats().bulkSendCount).toBe(before + 1);
    });

    it('네트워크 에러 시 재시도 후 최종 실패 시 bulkFailCount 증가', async () => {
      const before = DataSender.getStats().bulkFailCount;

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

      // maxRetries=0 means no retries (single attempt)
      await DataSender.sendHistory(candles, 0);
      expect(DataSender.getStats().bulkFailCount).toBe(before + 1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('재시도 성공 시 bulkSuccessCount 증가하고 bulkFailCount 불변', async () => {
      const beforeFail = DataSender.getStats().bulkFailCount;
      const beforeSuccess = DataSender.getStats().bulkSuccessCount;

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('first fail'));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ count: 2 }),
        });
      });

      // maxRetries=1, first attempt fails, second succeeds
      await DataSender.sendHistory(candles, 1);
      expect(DataSender.getStats().bulkSuccessCount).toBe(beforeSuccess + 1);
      expect(DataSender.getStats().bulkFailCount).toBe(beforeFail); // no fail count
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // getStats
  // ============================================================
  describe('getStats', () => {
    it('통계 스냅샷을 반환한다 (복사본)', () => {
      const stats1 = DataSender.getStats();
      const stats2 = DataSender.getStats();
      expect(stats1).not.toBe(stats2); // 다른 참조
      expect(stats1).toEqual(stats2); // 같은 값
    });
  });
});

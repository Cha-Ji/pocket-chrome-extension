import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoTrader, AutoTraderConfig, AutoTraderStats } from './auto-trader';
import { POError, ErrorCode, errorHandler } from '../errors';

// fetchCandles, SignalGenerator 모킹
vi.mock('../signals/signal-generator', () => ({
  SignalGenerator: vi.fn().mockImplementation(() => ({
    addCandle: vi.fn().mockReturnValue(null),
    setHistory: vi.fn(),
  })),
  fetchCandles: vi.fn().mockResolvedValue([]),
}));

// 기본 테스트 설정 (모든 리스크 제한을 넉넉하게)
const defaultConfig: Partial<AutoTraderConfig> = {
  enabled: false,
  symbol: 'BTCUSDT',
  initialBalance: 1000,
  riskPerTrade: 2,
  fixedAmount: 10,
  usePercentage: true,
  minAmount: 1,
  maxAmount: 100,
  expiry: 60,
  cooldownMs: 0,
  maxDailyTrades: 20,
  maxDailyLoss: 100,
  maxDailyLossPercent: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  demoMode: true,
};

// stats를 직접 조작하기 위한 헬퍼
// AutoTrader의 private stats에 접근
function getPrivateStats(trader: AutoTrader): AutoTraderStats {
  return (trader as any).stats;
}

function setPrivateStats(trader: AutoTrader, updates: Partial<AutoTraderStats>): void {
  const stats = (trader as any).stats;
  Object.assign(stats, updates);
}

describe('AutoTrader', () => {
  let trader: AutoTrader;

  beforeEach(() => {
    vi.clearAllMocks();
    trader = new AutoTrader(defaultConfig);
  });

  // ============================================================
  // 리스크 관리 6단계 체크
  // ============================================================

  describe('리스크 관리 - 일일 거래 한도', () => {
    it('거래 횟수가 한도 미만이면 halt하지 않는다', () => {
      setPrivateStats(trader, { todayTrades: 19 });
      // tick을 직접 호출하여 리스크 체크
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
    });

    it('거래 횟수가 한도에 도달하면 halt한다', () => {
      setPrivateStats(trader, { todayTrades: 20 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toContain('Daily trade limit');
    });
  });

  describe('리스크 관리 - 일일 손실 한도 (절대값)', () => {
    it('일일 손실이 한도 미만이면 halt하지 않는다', () => {
      setPrivateStats(trader, { todayProfit: -99 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
    });

    it('일일 손실이 한도에 도달하면 halt한다', () => {
      setPrivateStats(trader, { todayProfit: -100 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toContain('Daily loss limit');
    });

    it('일일 손실이 한도를 초과하면 halt한다', () => {
      setPrivateStats(trader, { todayProfit: -150 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
    });
  });

  describe('리스크 관리 - 일일 손실 한도 (퍼센트)', () => {
    it('손실 퍼센트가 한도 미만이면 halt하지 않는다', () => {
      // initialBalance 1000의 9% = -90
      setPrivateStats(trader, { todayProfit: -90 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      // maxDailyLoss = 100이 먼저 걸리지 않으므로, 9% < 10% → halt하지 않음
      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
    });

    it('손실 퍼센트가 한도에 도달하면 halt한다', () => {
      // initialBalance 1000의 10% = -100
      // maxDailyLoss도 100이므로, 절대값 한도에서도 걸림
      // 절대값 한도를 높여서 퍼센트 한도만 테스트
      const traderPercent = new AutoTrader({
        ...defaultConfig,
        maxDailyLoss: 200, // 절대값 한도를 높임
        maxDailyLossPercent: 10,
        initialBalance: 1000,
      });
      setPrivateStats(traderPercent, { todayProfit: -100 });
      (traderPercent as any).config.enabled = true;
      (traderPercent as any).tick();

      const stats = traderPercent.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toContain('%');
    });
  });

  describe('리스크 관리 - 최대 드로다운', () => {
    it('드로다운이 한도 미만이면 halt하지 않는다', () => {
      setPrivateStats(trader, { currentDrawdown: 19.9 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
    });

    it('드로다운이 한도에 도달하면 halt한다', () => {
      setPrivateStats(trader, { currentDrawdown: 20 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toContain('drawdown');
    });
  });

  describe('리스크 관리 - 연속 손실', () => {
    it('연속 손실이 한도 미만이면 halt하지 않는다', () => {
      setPrivateStats(trader, { consecutiveLosses: 4 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
    });

    it('연속 손실이 한도에 도달하면 halt한다', () => {
      setPrivateStats(trader, { consecutiveLosses: 5 });
      (trader as any).config.enabled = true;
      (trader as any).tick();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toContain('consecutive losses');
    });
  });

  describe('리스크 관리 - 쿨다운', () => {
    it('쿨다운 시간 내에는 거래하지 않는다', async () => {
      const traderCooldown = new AutoTrader({
        ...defaultConfig,
        cooldownMs: 30000,
      });
      // 마지막 거래를 방금 전으로 설정
      setPrivateStats(traderCooldown, { lastTradeTime: Date.now() });
      (traderCooldown as any).config.enabled = true;

      // tick이 fetchCandles를 호출하지 않아야 함 (쿨다운으로 인해 early return)
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockClear();

      await (traderCooldown as any).tick();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('쿨다운 시간이 지나면 거래를 시도한다', async () => {
      const traderCooldown = new AutoTrader({
        ...defaultConfig,
        cooldownMs: 30000,
      });
      // 마지막 거래를 충분히 이전으로 설정
      setPrivateStats(traderCooldown, { lastTradeTime: Date.now() - 60000 });
      (traderCooldown as any).config.enabled = true;

      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockClear();
      fetchMock.mockResolvedValue([{ timestamp: 1, open: 100, high: 101, low: 99, close: 100 }]);

      await (traderCooldown as any).tick();

      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 포지션 사이징
  // ============================================================

  describe('포지션 사이징 - 퍼센트 모드', () => {
    it('현재 잔액의 지정된 퍼센트로 계산한다', () => {
      // currentBalance = 1000, riskPerTrade = 2% → 20
      setPrivateStats(trader, { currentBalance: 1000 });
      const size = (trader as any).calculatePositionSize();
      expect(size).toBe(20);
    });

    it('minAmount 이하로 내려가지 않는다', () => {
      setPrivateStats(trader, { currentBalance: 10 });
      // 10 * 2% = 0.2, minAmount = 1
      const size = (trader as any).calculatePositionSize();
      expect(size).toBe(1);
    });

    it('maxAmount을 초과하지 않는다', () => {
      setPrivateStats(trader, { currentBalance: 100000 });
      // 100000 * 2% = 2000, maxAmount = 100
      const size = (trader as any).calculatePositionSize();
      expect(size).toBe(100);
    });

    it('소수점 둘째 자리로 반올림한다', () => {
      setPrivateStats(trader, { currentBalance: 333 });
      // 333 * 2% = 6.66
      const size = (trader as any).calculatePositionSize();
      expect(size).toBe(6.66);
    });
  });

  describe('포지션 사이징 - 고정 금액 모드', () => {
    it('fixedAmount 값을 사용한다', () => {
      const traderFixed = new AutoTrader({
        ...defaultConfig,
        usePercentage: false,
        fixedAmount: 25,
      });
      const size = (traderFixed as any).calculatePositionSize();
      expect(size).toBe(25);
    });

    it('fixedAmount가 없으면 기본값 10을 사용한다', () => {
      const traderFixed = new AutoTrader({
        ...defaultConfig,
        usePercentage: false,
        fixedAmount: undefined,
      });
      const size = (traderFixed as any).calculatePositionSize();
      expect(size).toBe(10);
    });

    it('고정 금액도 minAmount/maxAmount 범위를 따른다', () => {
      const traderFixed = new AutoTrader({
        ...defaultConfig,
        usePercentage: false,
        fixedAmount: 200,
        maxAmount: 100,
      });
      const size = (traderFixed as any).calculatePositionSize();
      expect(size).toBe(100);
    });
  });

  // ============================================================
  // 드로다운 계산
  // ============================================================

  describe('드로다운 업데이트', () => {
    it('잔액이 최고점보다 높으면 peakBalance를 갱신한다', () => {
      setPrivateStats(trader, { currentBalance: 1200, peakBalance: 1100 });
      (trader as any).updateDrawdown();

      const stats = trader.getStats();
      expect(stats.peakBalance).toBe(1200);
      expect(stats.currentDrawdown).toBe(0); // 최고점이므로 드로다운 0
    });

    it('잔액이 최고점보다 낮으면 드로다운을 계산한다', () => {
      setPrivateStats(trader, { currentBalance: 800, peakBalance: 1000 });
      (trader as any).updateDrawdown();

      const stats = trader.getStats();
      expect(stats.currentDrawdown).toBe(20); // (1000-800)/1000 * 100 = 20%
    });

    it('maxDrawdownHit을 갱신한다', () => {
      setPrivateStats(trader, {
        currentBalance: 700,
        peakBalance: 1000,
        maxDrawdownHit: 10,
      });
      (trader as any).updateDrawdown();

      const stats = trader.getStats();
      expect(stats.maxDrawdownHit).toBe(30); // (1000-700)/1000 * 100 = 30%
    });
  });

  // ============================================================
  // halt/resume/reset
  // ============================================================

  describe('halt, resume, resetDailyStats', () => {
    it('haltTrading이 올바르게 상태를 설정한다', () => {
      (trader as any).haltTrading('테스트 사유');

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(true);
      expect(stats.haltReason).toBe('테스트 사유');
    });

    it('resume가 halt 상태를 해제한다', () => {
      (trader as any).haltTrading('테스트 사유');
      trader.resume();

      const stats = trader.getStats();
      expect(stats.isHalted).toBe(false);
      expect(stats.haltReason).toBeNull();
    });

    it('resetDailyStats가 일일 통계를 초기화한다', () => {
      setPrivateStats(trader, {
        todayTrades: 15,
        todayWins: 10,
        todayLosses: 5,
        todayProfit: 50,
        isHalted: true,
        haltReason: '한도 도달',
        consecutiveLosses: 3,
        consecutiveWins: 2,
      });

      trader.resetDailyStats();

      const stats = trader.getStats();
      expect(stats.todayTrades).toBe(0);
      expect(stats.todayWins).toBe(0);
      expect(stats.todayLosses).toBe(0);
      expect(stats.todayProfit).toBe(0);
      expect(stats.isHalted).toBe(false);
      expect(stats.haltReason).toBeNull();
      expect(stats.consecutiveLosses).toBe(0);
      expect(stats.consecutiveWins).toBe(0);
    });
  });

  // ============================================================
  // isHalted일 때 tick 스킵
  // ============================================================

  describe('halt 상태에서 tick 동작', () => {
    it('isHalted가 true이면 tick에서 아무 작업도 하지 않는다', async () => {
      setPrivateStats(trader, { isHalted: true, haltReason: '테스트' });
      (trader as any).config.enabled = true;

      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockClear();

      await (trader as any).tick();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Public API
  // ============================================================

  describe('Public API', () => {
    it('getStats는 stats의 복사본을 반환한다', () => {
      const stats1 = trader.getStats();
      const stats2 = trader.getStats();
      expect(stats1).toEqual(stats2);
      expect(stats1).not.toBe(stats2);
    });

    it('getConfig는 config의 복사본을 반환한다', () => {
      const config1 = trader.getConfig();
      const config2 = trader.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('updateConfig가 설정을 올바르게 변경한다', () => {
      trader.updateConfig({ maxDailyTrades: 50 });
      const config = trader.getConfig();
      expect(config.maxDailyTrades).toBe(50);
    });

    it('getRiskSummary가 올바른 형태를 반환한다', () => {
      const summary = trader.getRiskSummary();
      expect(summary).toHaveProperty('positionSize');
      expect(summary).toHaveProperty('riskPercent');
      expect(summary).toHaveProperty('currentDrawdown');
      expect(summary).toHaveProperty('maxDrawdown');
      expect(summary).toHaveProperty('consecutiveLosses');
      expect(summary).toHaveProperty('isHalted');
      expect(summary).toHaveProperty('haltReason');
    });

    it('stop이 isRunning과 enabled를 false로 변경한다', () => {
      (trader as any).isRunning = true;
      (trader as any).config.enabled = true;
      trader.stop();

      expect((trader as any).isRunning).toBe(false);
      expect((trader as any).config.enabled).toBe(false);
    });
  });

  // ============================================================
  // 콜백 설정
  // ============================================================

  describe('콜백 설정', () => {
    it('setLogCallback이 로그를 전달한다', () => {
      const logs: string[] = [];
      trader.setLogCallback((msg) => logs.push(msg));
      (trader as any).log('테스트 메시지', 'info');

      expect(logs).toContain('테스트 메시지');
    });

    it('setExecuteCallback이 설정된다', () => {
      const cb = vi.fn().mockResolvedValue(true);
      trader.setExecuteCallback(cb);
      expect((trader as any).onExecute).toBe(cb);
    });

    it('setResultCallback이 설정된다', () => {
      const cb = vi.fn();
      trader.setResultCallback(cb);
      expect((trader as any).onResult).toBe(cb);
    });

    it('setErrorCallback이 설정된다', () => {
      const cb = vi.fn();
      trader.setErrorCallback(cb);
      expect((trader as any).onError).toBe(cb);
    });
  });

  // ============================================================
  // 에러 전파 (silent fail 제거 검증)
  // ============================================================

  describe('에러 전파 - tick에서 fetchCandles 실패', () => {
    it('tick에서 에러 발생 시 onError 콜백으로 POError가 전파된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('Network failure'));

      const errors: POError[] = [];
      trader.setErrorCallback((err) => errors.push(err));
      (trader as any).config.enabled = true;

      await (trader as any).tick();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(POError);
      expect(errors[0].code).toBe(ErrorCode.NETWORK_REQUEST_FAILED);
      expect(errors[0].context.module).toBe('lib/trading');
      expect(errors[0].context.function).toBe('tick');
    });

    it('tick에서 에러 발생 시 errorHandler에도 기록된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('Network failure'));

      errorHandler.clearHistory();
      (trader as any).config.enabled = true;

      await (trader as any).tick();

      const history = errorHandler.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].error.code).toBe(ErrorCode.NETWORK_REQUEST_FAILED);
    });

    it('tick에서 에러 발생 시 로그 콜백에 에러 메시지가 전달된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('Network failure'));

      const logs: Array<{ message: string; level: string }> = [];
      trader.setLogCallback((msg, level) => logs.push({ message: msg, level }));
      (trader as any).config.enabled = true;

      await (trader as any).tick();

      const errorLogs = logs.filter((l) => l.level === 'error');
      expect(errorLogs.length).toBeGreaterThanOrEqual(1);
      expect(errorLogs[0].message).toContain('NETWORK_REQUEST_FAILED');
    });
  });

  describe('에러 전파 - loadHistory에서 실패', () => {
    it('loadHistory에서 에러 발생 시 onError 콜백으로 전파된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('API timeout'));

      const errors: POError[] = [];
      trader.setErrorCallback((err) => errors.push(err));

      await (trader as any).loadHistory();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(POError);
      expect(errors[0].context.function).toBe('loadHistory');
    });
  });

  describe('에러 전파 - simulateResult에서 실패', () => {
    it('simulateResult에서 에러 발생 시 onError 콜백으로 전파된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValueOnce(new Error('Price fetch failed'));

      const errors: POError[] = [];
      trader.setErrorCallback((err) => errors.push(err));

      const execution = {
        signalId: 'test-1',
        executedAt: Date.now(),
        direction: 'CALL' as const,
        amount: 10,
        expiry: 60,
        entryPrice: 50000,
      };

      await (trader as any).simulateResult(execution);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(POError);
      expect(errors[0].context.function).toBe('simulateResult');
    });
  });

  describe('에러 전파 - executeSignal에서 콜백 실패', () => {
    it('onExecute 콜백이 throw하면 POError로 정규화되어 전파된다', async () => {
      const liveTrader = new AutoTrader({
        ...defaultConfig,
        demoMode: false,
      });

      liveTrader.setExecuteCallback(async () => {
        throw new Error('Executor crashed');
      });

      const errors: POError[] = [];
      liveTrader.setErrorCallback((err) => errors.push(err));

      const signal = {
        id: 'sig-1',
        symbol: 'BTCUSDT',
        direction: 'CALL' as const,
        strategy: 'test',
        confidence: 0.9,
        entryPrice: 50000,
        timestamp: Date.now(),
        expiry: 60,
      };

      await (liveTrader as any).executeSignal(signal);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(POError);
      expect(errors[0].code).toBe(ErrorCode.TRADE_EXECUTION_FAILED);
    });

    it('onExecute가 false를 반환하면 TRADE_EXECUTION_FAILED POError가 전파된다', async () => {
      const liveTrader = new AutoTrader({
        ...defaultConfig,
        demoMode: false,
      });

      liveTrader.setExecuteCallback(async () => false);

      const errors: POError[] = [];
      liveTrader.setErrorCallback((err) => errors.push(err));

      const signal = {
        id: 'sig-2',
        symbol: 'BTCUSDT',
        direction: 'PUT' as const,
        strategy: 'test',
        confidence: 0.8,
        entryPrice: 50000,
        timestamp: Date.now(),
        expiry: 60,
      };

      await (liveTrader as any).executeSignal(signal);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(ErrorCode.TRADE_EXECUTION_FAILED);
    });
  });

  describe('에러 전파 - handleError가 POError를 재활용한다', () => {
    it('이미 POError인 경우 코드를 유지한다', () => {
      const original = new POError({
        code: ErrorCode.TRADE_INVALID_AMOUNT,
        message: 'test',
        context: { module: 'lib/trading', function: 'test' },
      });

      const result = (trader as any).handleError(original, 'test');

      expect(result).toBeInstanceOf(POError);
      expect(result.code).toBe(ErrorCode.TRADE_INVALID_AMOUNT);
    });

    it('일반 Error는 지정된 코드로 POError로 변환된다', () => {
      const result = (trader as any).handleError(
        new Error('plain error'),
        'test',
        ErrorCode.TRADE_EXECUTION_FAILED,
      );

      expect(result).toBeInstanceOf(POError);
      expect(result.code).toBe(ErrorCode.TRADE_EXECUTION_FAILED);
      expect(result.message).toBe('plain error');
    });

    it('onError 콜백이 throw해도 handleError는 정상 반환한다', () => {
      trader.setErrorCallback(() => {
        throw new Error('callback bug');
      });

      const result = (trader as any).handleError(
        new Error('original error'),
        'test',
        ErrorCode.UNKNOWN,
      );

      expect(result).toBeInstanceOf(POError);
      expect(result.message).toBe('original error');
    });
  });

  // ============================================================
  // onError 콜백 예외 방어 — interval loop 안정성
  // ============================================================

  describe('onError 콜백 throw 시 interval loop 안정성', () => {
    it('tick에서 에러 발생 + onError throw해도 isRunning/enabled 상태가 유지된다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValue(new Error('network down'));

      // onError 콜백이 항상 throw
      trader.setErrorCallback(() => {
        throw new Error('consumer bug');
      });

      (trader as any).isRunning = true;
      (trader as any).config.enabled = true;

      // 첫 번째 tick — 에러 발생 + onError throw
      await (trader as any).tick();

      expect((trader as any).isRunning).toBe(true);
      expect((trader as any).config.enabled).toBe(true);
      expect(trader.getStats().isHalted).toBe(false);
    });

    it('onError가 throw해도 연속 tick이 정상 동작한다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValue(new Error('network down'));

      let errorCallCount = 0;
      trader.setErrorCallback(() => {
        errorCallCount++;
        throw new Error(`consumer bug #${errorCallCount}`);
      });

      (trader as any).isRunning = true;
      (trader as any).config.enabled = true;

      // 3회 연속 tick — 매번 에러 + onError throw
      await (trader as any).tick();
      await (trader as any).tick();
      await (trader as any).tick();

      // onError가 매 tick마다 호출됨 (throw에도 불구하고 loop 지속)
      expect(errorCallCount).toBe(3);
      expect((trader as any).isRunning).toBe(true);
      expect((trader as any).config.enabled).toBe(true);
    });

    it('onError throw 후에도 stats(todayTrades 등)가 깨지지 않는다', async () => {
      const { fetchCandles } = await import('../signals/signal-generator');
      const fetchMock = fetchCandles as ReturnType<typeof vi.fn>;
      fetchMock.mockRejectedValue(new Error('network down'));

      const statsBefore = trader.getStats();

      trader.setErrorCallback(() => {
        throw new Error('consumer bug');
      });

      (trader as any).config.enabled = true;
      await (trader as any).tick();

      const statsAfter = trader.getStats();
      // tick 에러는 거래 실행 전에 발생하므로 거래 통계 변경 없음
      expect(statsAfter.todayTrades).toBe(statsBefore.todayTrades);
      expect(statsAfter.todayWins).toBe(statsBefore.todayWins);
      expect(statsAfter.todayLosses).toBe(statsBefore.todayLosses);
      expect(statsAfter.todayProfit).toBe(statsBefore.todayProfit);
      expect(statsAfter.isHalted).toBe(false);
    });

    it('onLog + onError 둘 다 throw해도 handleError가 정상 반환한다', () => {
      trader.setLogCallback(() => {
        throw new Error('log callback bug');
      });
      trader.setErrorCallback(() => {
        throw new Error('error callback bug');
      });

      const result = (trader as any).handleError(
        new Error('original error'),
        'test',
        ErrorCode.UNKNOWN,
      );

      expect(result).toBeInstanceOf(POError);
      expect(result.message).toBe('original error');
    });
  });
});

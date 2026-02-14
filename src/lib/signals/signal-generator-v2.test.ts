import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SignalGeneratorV2, generateLLMReport } from './signal-generator-v2'
import { Candle, Signal, MarketRegime } from './types'

// strategies의 detectRegime를 모킹 (내부에서 사용)
vi.mock('./strategies', () => ({
  detectRegime: vi.fn().mockReturnValue({ regime: 'ranging', adx: 15, direction: 0 }),
}))

// high-winrate 전략들을 모킹
vi.mock('../backtest/strategies/high-winrate', () => ({
  rsiBBBounceStrategy: vi.fn().mockReturnValue(null),
  voteStrategy: vi.fn().mockReturnValue(null),
  emaTrendRsiPullbackStrategy: vi.fn().mockReturnValue(null),
  tripleConfirmationStrategy: vi.fn().mockReturnValue(null),
}))

// zmr-60 전략을 모킹
vi.mock('../backtest/strategies/zmr-60', () => ({
  zmr60WithHighWinRateConfig: vi.fn().mockReturnValue({ signal: null, confidence: 0, reason: 'No signal', indicators: {} }),
}))

// ============================================================
// 헬퍼: 테스트용 캔들 데이터 생성
// ============================================================

function makeCandle(close: number, timestamp: number = Date.now(), partial?: Partial<Candle>): Candle {
  return {
    timestamp,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
    ...partial,
  }
}

function generateCandles(count: number, basePrice: number = 50000): Candle[] {
  const candles: Candle[] = []
  let price = basePrice
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 5
    candles.push(makeCandle(price, 1000000 + i * 60000))
  }
  return candles
}

describe('SignalGeneratorV2', () => {
  let generator: SignalGeneratorV2

  beforeEach(() => {
    vi.clearAllMocks()
    generator = new SignalGeneratorV2({
      minConfidence: 0.1,
    })
  })

  // ============================================================
  // 캔들 버퍼 관리
  // ============================================================

  describe('캔들 버퍼 관리', () => {
    it('addCandle로 캔들을 추가할 수 있다', () => {
      const candle = makeCandle(50000, 1000000)
      const result = generator.addCandle('BTCUSDT', candle)
      // 50개 미만이므로 null
      expect(result).toBeNull()
    })

    it('버퍼 크기가 250개로 제한된다', () => {
      const candles = generateCandles(300)
      for (const candle of candles) {
        generator.addCandle('BTCUSDT', candle)
      }
      const buffer = (generator as any).candleBuffer.get('BTCUSDT')
      expect(buffer.length).toBeLessThanOrEqual(250)
    })

    it('setHistory로 히스토리를 설정할 수 있다', () => {
      const candles = generateCandles(300)
      generator.setHistory('BTCUSDT', candles)
      const buffer = (generator as any).candleBuffer.get('BTCUSDT')
      expect(buffer).toHaveLength(250) // 최대 250개만 유지 (SBB-120: 140 필요)
    })

    it('setHistory에 100개 이하 데이터도 정상 동작한다', () => {
      const candles = generateCandles(30)
      generator.setHistory('BTCUSDT', candles)
      const buffer = (generator as any).candleBuffer.get('BTCUSDT')
      expect(buffer).toHaveLength(30)
    })

    it('심볼별로 독립적인 버퍼를 관리한다', () => {
      generator.addCandle('BTCUSDT', makeCandle(50000, 1000000))
      generator.addCandle('ETHUSDT', makeCandle(3000, 1000000))

      const btcBuffer = (generator as any).candleBuffer.get('BTCUSDT')
      const ethBuffer = (generator as any).candleBuffer.get('ETHUSDT')
      expect(btcBuffer).toHaveLength(1)
      expect(ethBuffer).toHaveLength(1)
    })
  })

  // ============================================================
  // 부족한 데이터 엣지 케이스
  // ============================================================

  describe('부족한 데이터 처리', () => {
    it('캔들 50개 미만이면 null을 반환한다', () => {
      const candles = generateCandles(49)
      for (const candle of candles) {
        generator.addCandle('BTCUSDT', candle)
      }
      const result = generator.addCandle('BTCUSDT', makeCandle(50000, 2000000))
      expect(result).toBeNull()
    })

    it('getRegime는 캔들 50개 미만이면 null을 반환한다', () => {
      const candles = generateCandles(30)
      generator.setHistory('BTCUSDT', candles)
      const regime = generator.getRegime('BTCUSDT')
      expect(regime).toBeNull()
    })

    it('존재하지 않는 심볼에 대해 getRegime은 null을 반환한다', () => {
      const regime = generator.getRegime('NONEXISTENT')
      expect(regime).toBeNull()
    })
  })

  // ============================================================
  // 신호 관리
  // ============================================================

  describe('신호 관리', () => {
    it('getSignals는 빈 배열로 시작한다', () => {
      const signals = generator.getSignals()
      expect(signals).toEqual([])
    })

    it('getSignals는 limit에 따라 최근 신호를 반환한다', () => {
      const mockSignals: Signal[] = Array.from({ length: 15 }, (_, i) => ({
        id: `sig-${i}`,
        timestamp: Date.now() + i * 1000,
        symbol: 'BTCUSDT',
        direction: 'CALL' as const,
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging' as MarketRegime,
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000 + i,
        indicators: {},
        status: 'pending' as const,
      }))
      ;(generator as any).signals = mockSignals

      const last5 = generator.getSignals(5)
      expect(last5).toHaveLength(5)
      expect(last5[0].id).toBe('sig-10')
    })

    it('updateSignalResult가 신호 상태를 변경한다', () => {
      const signal: Signal = {
        id: 'test-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      }
      ;(generator as any).signals = [signal]

      generator.updateSignalResult('test-signal', 'win')

      const signals = generator.getSignals()
      expect(signals[0].status).toBe('win')
    })

    it('updateSignalResult은 전략별 통계도 업데이트한다', () => {
      const signal: Signal = {
        id: 'test-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      }
      ;(generator as any).signals = [signal]

      generator.updateSignalResult('test-signal', 'win')

      const stats = generator.getStats()
      expect(stats.byStrategy['RSI-BB']).toBeDefined()
      expect(stats.byStrategy['RSI-BB'].wins).toBe(1)
    })

    it('updateSignalResult은 존재하지 않는 ID에 대해 아무 작업도 하지 않는다', () => {
      ;(generator as any).signals = []
      generator.updateSignalResult('nonexistent', 'loss')
      expect(generator.getSignals()).toHaveLength(0)
    })

    it('updateSignalResult은 tie를 올바르게 처리한다', () => {
      const signal: Signal = {
        id: 'tie-signal',
        timestamp: Date.now(),
        symbol: 'BTCUSDT',
        direction: 'CALL',
        strategyId: 'RSI-BB',
        strategy: 'RSI+BB',
        regime: 'ranging',
        confidence: 0.7,
        expiry: 60,
        entryPrice: 50000,
        indicators: {},
        status: 'pending',
      }
      ;(generator as any).signals = [signal]

      generator.updateSignalResult('tie-signal', 'tie')

      const signals = generator.getSignals()
      expect(signals[0].status).toBe('tie')
    })

    it('updateSignalResult은 tie를 전략별 통계에 별도 카운트한다', () => {
      const signals: Signal[] = [
        { id: 's1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.7, expiry: 60, entryPrice: 50000, indicators: {}, status: 'pending' },
        { id: 's2', timestamp: Date.now(), symbol: 'BTC', direction: 'PUT', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.7, expiry: 60, entryPrice: 50000, indicators: {}, status: 'pending' },
        { id: 's3', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.7, expiry: 60, entryPrice: 50000, indicators: {}, status: 'pending' },
      ]
      ;(generator as any).signals = signals

      generator.updateSignalResult('s1', 'win')
      generator.updateSignalResult('s2', 'loss')
      generator.updateSignalResult('s3', 'tie')

      const stats = generator.getStats()
      expect(stats.byStrategy['RSI-BB'].wins).toBe(1)
      expect(stats.byStrategy['RSI-BB'].losses).toBe(1)
      expect(stats.byStrategy['RSI-BB'].ties).toBe(1)
    })
  })

  // ============================================================
  // 구독(onSignal) 관리
  // ============================================================

  describe('구독 관리', () => {
    it('onSignal로 콜백을 등록하고 해제할 수 있다', () => {
      const callback = vi.fn()
      const unsubscribe = generator.onSignal(callback)
      expect((generator as any).listeners).toHaveLength(1)

      unsubscribe()
      expect((generator as any).listeners).toHaveLength(0)
    })
  })

  // ============================================================
  // getStats 통계
  // ============================================================

  describe('getStats', () => {
    it('초기 상태에서 올바른 기본 통계를 반환한다', () => {
      const stats = generator.getStats()
      expect(stats.signalsGenerated).toBe(0)
      expect(stats.signalsFiltered).toBe(0)
      expect(stats.byStrategy).toEqual({})
    })
  })

  // ============================================================
  // passesTrendFilter 내부 메서드
  // ============================================================

  describe('passesTrendFilter', () => {
    it('strong_uptrend에서 CALL만 허용한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('CALL', { regime: 'strong_uptrend', adx: 45, direction: 1 })).toBe(true)
      expect(passesTrendFilter('PUT', { regime: 'strong_uptrend', adx: 45, direction: 1 })).toBe(false)
    })

    it('strong_downtrend에서 PUT만 허용한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('PUT', { regime: 'strong_downtrend', adx: 45, direction: -1 })).toBe(true)
      expect(passesTrendFilter('CALL', { regime: 'strong_downtrend', adx: 45, direction: -1 })).toBe(false)
    })

    it('weak_uptrend에서 ADX >= 30이면 PUT을 거부한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('PUT', { regime: 'weak_uptrend', adx: 35, direction: 1 })).toBe(false)
      expect(passesTrendFilter('CALL', { regime: 'weak_uptrend', adx: 35, direction: 1 })).toBe(true)
    })

    it('weak_downtrend에서 ADX >= 30이면 CALL을 거부한다', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('CALL', { regime: 'weak_downtrend', adx: 35, direction: -1 })).toBe(false)
      expect(passesTrendFilter('PUT', { regime: 'weak_downtrend', adx: 35, direction: -1 })).toBe(true)
    })

    it('ADX < 30이면 약한 추세에서도 모든 방향 허용', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('PUT', { regime: 'weak_uptrend', adx: 25, direction: 1 })).toBe(true)
      expect(passesTrendFilter('CALL', { regime: 'weak_downtrend', adx: 25, direction: -1 })).toBe(true)
    })

    it('ranging에서는 모든 방향 허용', () => {
      const passesTrendFilter = (generator as any).passesTrendFilter.bind(generator)
      expect(passesTrendFilter('CALL', { regime: 'ranging', adx: 15, direction: 0 })).toBe(true)
      expect(passesTrendFilter('PUT', { regime: 'ranging', adx: 15, direction: 0 })).toBe(true)
    })
  })

  // ============================================================
  // selectStrategy 내부 메서드
  // ============================================================

  describe('selectStrategy', () => {
    it('ranging이 아닌 regime + ADX >= 25이면 null 반환', () => {
      const selectStrategy = (generator as any).selectStrategy.bind(generator)
      const candles = generateCandles(60)
      const result = selectStrategy(candles, { regime: 'weak_uptrend', adx: 30, direction: 1 })
      expect(result).toBeNull()
    })

    it('ranging regime에서는 rsiBBBounceStrategy를 호출한다', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate')
      const selectStrategy = (generator as any).selectStrategy.bind(generator)
      const candles = generateCandles(60)

      selectStrategy(candles, { regime: 'ranging', adx: 15, direction: 0 })
      expect(rsiBBBounceStrategy).toHaveBeenCalledWith(candles, expect.any(Object))
    })

    it('non-ranging regime에서는 ADX 값과 무관하게 null을 반환한다', async () => {
      const { rsiBBBounceStrategy } = await import('../backtest/strategies/high-winrate')
      ;(rsiBBBounceStrategy as ReturnType<typeof vi.fn>).mockClear()

      const selectStrategy = (generator as any).selectStrategy.bind(generator)
      const candles = generateCandles(60)

      const result = selectStrategy(candles, { regime: 'weak_uptrend', adx: 20, direction: 1 })
      expect(result).toBeNull()
      expect(rsiBBBounceStrategy).not.toHaveBeenCalled()
    })
  })
})

// ============================================================
// generateLLMReport
// ============================================================

describe('generateLLMReport', () => {
  it('빈 신호 배열에서 summary 문자열을 반환한다', () => {
    const report = generateLLMReport([]) as any
    expect(report.summary).toBe('No signals generated yet')
    expect(report.recommendation).toContain('Wait')
  })

  it('신호가 있으면 summary 객체를 반환한다', () => {
    const signals: Signal[] = [
      { id: '1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB: bounce', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'win' },
      { id: '2', timestamp: Date.now(), symbol: 'BTC', direction: 'PUT', strategyId: 'RSI-BB', strategy: 'RSI+BB: bounce', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'loss' },
      { id: '3', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB: bounce', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'pending' },
    ]

    const report = generateLLMReport(signals) as any
    expect(report.summary.totalSignals).toBe(3)
    expect(report.summary.completed).toBe(2) // win + loss
    expect(report.summary.pending).toBe(1)
    expect(report.summary.wins).toBe(1)
    expect(report.summary.losses).toBe(1)
    expect(report.summary.winRate).toBe('50.0%')
  })

  it('전략별 성과를 strategyId 기준으로 분류한다', () => {
    const signals: Signal[] = [
      { id: '1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB: oversold bounce', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'win' },
      { id: '2', timestamp: Date.now(), symbol: 'BTC', direction: 'PUT', strategyId: 'RSI-BB', strategy: 'RSI+BB: overbought bounce', regime: 'ranging', confidence: 0.7, expiry: 60, entryPrice: 50000, indicators: {}, status: 'loss' },
    ]

    const report = generateLLMReport(signals) as any
    // Both signals share strategyId 'RSI-BB' → grouped into one entry
    expect(report.performance.byStrategy).toHaveLength(1)
    expect(report.performance.byStrategy[0].name).toBe('RSI-BB')
    expect(report.performance.byStrategy[0].signals).toBe(2)
  })

  it('시장 레짐별 성과를 분류한다', () => {
    const signals: Signal[] = [
      { id: '1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'win' },
      { id: '2', timestamp: Date.now(), symbol: 'BTC', direction: 'PUT', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'weak_uptrend', confidence: 0.7, expiry: 60, entryPrice: 50000, indicators: {}, status: 'loss' },
    ]

    const report = generateLLMReport(signals) as any
    expect(report.performance.byRegime).toHaveLength(2)
    const ranging = report.performance.byRegime.find((r: any) => r.name === 'ranging')
    expect(ranging).toBeDefined()
    expect(ranging.signals).toBe(1)
  })

  it('최근 5개 신호만 recentSignals에 포함한다', () => {
    const signals: Signal[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sig-${i}`,
      timestamp: Date.now() + i,
      symbol: 'BTC',
      direction: 'CALL' as const,
      strategyId: 'RSI-BB',
      strategy: 'RSI+BB',
      regime: 'ranging' as MarketRegime,
      confidence: 0.8,
      expiry: 60,
      entryPrice: 50000,
      indicators: {},
      status: 'win' as const,
    }))

    const report = generateLLMReport(signals) as any
    expect(report.recentSignals).toHaveLength(5)
  })

  it('tie가 포함된 신호에서 winRate를 Policy A로 계산한다 (ties 제외)', () => {
    const signals: Signal[] = [
      { id: '1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'win' },
      { id: '2', timestamp: Date.now(), symbol: 'BTC', direction: 'PUT', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'loss' },
      { id: '3', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'tie' },
      { id: '4', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'pending' },
    ]

    const report = generateLLMReport(signals) as any
    // Policy A: winRate = wins / (wins + losses) = 1/2 = 50.0%
    // NOT 1/3 (excluding pending) or 1/4 (including all)
    expect(report.summary.winRate).toBe('50.0%')
    expect(report.summary.wins).toBe(1)
    expect(report.summary.losses).toBe(1)
    expect(report.summary.ties).toBe(1)
    expect(report.summary.pending).toBe(1)
    expect(report.summary.completed).toBe(2) // only decided trades (win + loss)
  })

  it('tie만 있으면 winRate는 N/A이다', () => {
    const signals: Signal[] = [
      { id: '1', timestamp: Date.now(), symbol: 'BTC', direction: 'CALL', strategyId: 'RSI-BB', strategy: 'RSI+BB', regime: 'ranging', confidence: 0.8, expiry: 60, entryPrice: 50000, indicators: {}, status: 'tie' },
    ]

    const report = generateLLMReport(signals) as any
    expect(report.summary.winRate).toBe('N/A%')
    expect(report.summary.ties).toBe(1)
    expect(report.summary.completed).toBe(0)
  })

  it('승률 55% 이상이면 positive recommendation', () => {
    const signals: Signal[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sig-${i}`,
      timestamp: Date.now() + i,
      symbol: 'BTC',
      direction: 'CALL' as const,
      strategyId: 'RSI-BB',
      strategy: 'RSI+BB',
      regime: 'ranging' as MarketRegime,
      confidence: 0.8,
      expiry: 60,
      entryPrice: 50000,
      indicators: {},
      status: i < 6 ? 'win' as const : 'loss' as const, // 60% 승률
    }))

    const report = generateLLMReport(signals) as any
    expect(report.recommendation).toContain('above target')
  })
})

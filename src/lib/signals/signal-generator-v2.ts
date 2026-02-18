// ============================================================
// Signal Generator V2 - High Win Rate Optimized
// ============================================================
// 개선 사항:
// 1. 고승률 전략 모듈 통합 (high-winrate.ts)
// 2. 추세 방향 필터링
// 3. 신뢰도 기반 필터링
// 4. 시장 레짐별 전략 선택
// ============================================================

import { Candle, Signal, MarketRegime } from './types';
import { detectRegime } from './strategies';
import {
  rsiBBBounceStrategy,
  StrategyResult,
  HighWinRateConfig,
} from '../backtest/strategies/high-winrate';
import { sbb120Strategy } from '../backtest/strategies/sbb-120';
import { zmr60WithHighWinRateConfig, ZMR60Config } from '../backtest/strategies/zmr-60';
import type { StrategyConfigMap, SymbolStrategyConfig } from './strategy-config';
import type { Strategy as BacktestStrategy } from '../backtest/types';

// ============================================================
// Configuration
// ============================================================

export type ZMR60MergeMode = 'consensus' | 'best' | 'off';

export interface SignalGeneratorV2Config {
  symbols: string[];
  interval: string;
  minConfidence: number;
  expirySeconds: number;
  useTrendFilter: boolean;
  minVotesForSignal: number;
  highWinRateConfig: Partial<HighWinRateConfig>;
  zmr60MergeMode: ZMR60MergeMode;
  zmr60Config: Partial<ZMR60Config>;
  /** 심볼별 전략 설정 (strategy-config.json에서 로드) */
  strategyConfig?: StrategyConfigMap;
}

const DEFAULT_CONFIG: SignalGeneratorV2Config = {
  symbols: ['BTCUSDT'],
  interval: '1m',
  minConfidence: 0.6,
  expirySeconds: 60,
  useTrendFilter: true,
  minVotesForSignal: 2,
  highWinRateConfig: {
    rsiPeriod: 7,
    rsiOversold: 25,
    rsiOverbought: 75,
  },
  zmr60MergeMode: 'consensus',
  zmr60Config: {},
};

// ============================================================
// Signal Generator V2 Class
// ============================================================

// SBB-120 requires bbPeriod(20) + lookbackSqueeze(120) = 140 candles minimum.
// Use 250 to allow headroom for all strategies.
const MAX_CANDLE_BUFFER = 250;

export class SignalGeneratorV2 {
  private config: SignalGeneratorV2Config;
  private candleBuffer: Map<string, Candle[]> = new Map();
  private signals: Signal[] = [];
  private listeners: ((signal: Signal) => void)[] = [];
  private stats = {
    signalsGenerated: 0,
    signalsFiltered: 0,
    byStrategy: new Map<string, { count: number; wins: number; losses: number; ties: number }>(),
  };
  /** 백테스트 전략 레지스트리 (strategy-config에서 참조하는 전략) */
  private backtestStrategies: Map<string, BacktestStrategy> = new Map();

  constructor(config?: Partial<SignalGeneratorV2Config>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Add new candle and check for signals
   */
  addCandle(symbol: string, candle: Candle): Signal | null {
    if (!this.candleBuffer.has(symbol)) {
      this.candleBuffer.set(symbol, []);
    }

    const buffer = this.candleBuffer.get(symbol)!;
    buffer.push(candle);

    if (buffer.length > MAX_CANDLE_BUFFER) {
      buffer.splice(0, buffer.length - MAX_CANDLE_BUFFER);
    }

    if (buffer.length < 50) {
      return null;
    }

    return this.checkSignals(symbol, buffer);
  }

  /**
   * Set candle history
   */
  setHistory(symbol: string, candles: Candle[]): void {
    this.candleBuffer.set(symbol, candles.slice(-MAX_CANDLE_BUFFER));
  }

  /**
   * Get current market regime
   */
  getRegime(symbol: string): { regime: MarketRegime; adx: number; direction: number } | null {
    const candles = this.candleBuffer.get(symbol);
    if (!candles || candles.length < 50) return null;
    return detectRegime(candles);
  }

  /**
   * Get recent signals
   */
  getSignals(limit = 10): Signal[] {
    return this.signals.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      byStrategy: Object.fromEntries(this.stats.byStrategy),
    };
  }

  /**
   * Subscribe to signals
   */
  onSignal(callback: (signal: Signal) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Load strategy config for symbol-specific strategy selection.
   * When loaded, selectStrategy will prefer config-specified strategies
   * before falling back to the default behavior.
   */
  loadStrategyConfig(configMap: StrategyConfigMap): void {
    this.config.strategyConfig = configMap;
  }

  /**
   * Register a backtest strategy for use with strategy-config.
   * strategy-config references strategyIds from the leaderboard,
   * which are backtest strategy IDs.
   */
  registerBacktestStrategy(strategy: BacktestStrategy): void {
    this.backtestStrategies.set(strategy.id, strategy);
  }

  /**
   * Register multiple backtest strategies at once.
   */
  registerBacktestStrategies(strategies: BacktestStrategy[]): void {
    for (const s of strategies) {
      this.backtestStrategies.set(s.id, s);
    }
  }

  /**
   * Update signal result
   */
  updateSignalResult(signalId: string, result: 'win' | 'loss' | 'tie'): void {
    const signal = this.signals.find((s) => s.id === signalId);
    if (signal) {
      signal.status = result;

      // Update stats
      const stratKey = signal.strategyId || 'UNKNOWN';
      const stratStats = this.stats.byStrategy.get(stratKey) || {
        count: 0,
        wins: 0,
        losses: 0,
        ties: 0,
      };
      if (result === 'win') stratStats.wins++;
      else if (result === 'loss') stratStats.losses++;
      else stratStats.ties++;
      this.stats.byStrategy.set(stratKey, stratStats);
    }
  }

  // ============================================================
  // Internal Methods
  // ============================================================

  private checkSignals(symbol: string, candles: Candle[]): Signal | null {
    const regimeInfo = detectRegime(candles);

    // 1. 시장 레짐에 따른 전략 선택 (config가 있으면 config 우선)
    const strategyResult = this.selectStrategy(candles, regimeInfo, symbol);

    if (!strategyResult || !strategyResult.signal) {
      return null;
    }

    // 2. 추세 필터링 (옵션)
    if (this.config.useTrendFilter) {
      if (!this.passesTrendFilter(strategyResult.signal, regimeInfo)) {
        this.stats.signalsFiltered++;
        return null;
      }
    }

    // 3. 신뢰도 필터링
    if (strategyResult.confidence < this.config.minConfidence) {
      this.stats.signalsFiltered++;
      return null;
    }

    // 4. 신호 생성
    const signal = this.createSignal(symbol, strategyResult, regimeInfo, candles);
    this.signals.push(signal);
    this.stats.signalsGenerated++;

    // Update strategy stats
    const stratKey = signal.strategyId || 'UNKNOWN';
    const stratStats = this.stats.byStrategy.get(stratKey) || {
      count: 0,
      wins: 0,
      losses: 0,
      ties: 0,
    };
    stratStats.count++;
    this.stats.byStrategy.set(stratKey, stratStats);

    if (this.signals.length > 200) {
      this.signals.splice(0, this.signals.length - 200);
    }

    this.listeners.forEach((l) => l(signal));
    return signal;
  }

  private selectStrategy(
    candles: Candle[],
    regimeInfo: { regime: MarketRegime; adx: number; direction: number },
    symbol?: string,
  ): StrategyResult | null {
    // strategy-config가 있고 심볼에 대한 설정이 있으면 config 기반 선택 시도
    if (symbol && this.config.strategyConfig) {
      const symbolConfig = this.config.strategyConfig[symbol];
      if (symbolConfig) {
        const configResult = this.selectFromConfig(candles, symbolConfig);
        if (configResult && configResult.signal) {
          return configResult;
        }
        // config에서 신호가 없으면 기본 로직으로 fallback
      }
    }

    return this.selectStrategyDefault(candles, regimeInfo);
  }

  /**
   * strategy-config 기반 전략 선택.
   * 우선순위 순서로 전략을 시도하고, 첫 번째 신호를 반환한다.
   */
  private selectFromConfig(
    candles: Candle[],
    symbolConfig: SymbolStrategyConfig,
  ): StrategyResult | null {
    for (const strategyId of symbolConfig.strategies) {
      const params = symbolConfig.params[strategyId];
      try {
        const result = this.executeBacktestStrategy(strategyId, candles, params);
        if (result && result.signal) {
          return result;
        }
      } catch {
        // 전략 실행 실패 → 다음 전략으로 fallback
        continue;
      }
    }
    return null;
  }

  /**
   * 백테스트 전략을 StrategyResult 형식으로 실행한다.
   */
  private executeBacktestStrategy(
    strategyId: string,
    candles: Candle[],
    params?: Record<string, number>,
  ): StrategyResult | null {
    const strategy = this.backtestStrategies.get(strategyId);
    if (!strategy) return null;

    const effectiveParams = params ?? getDefaultParams(strategy);
    const signal = strategy.generateSignal(candles, effectiveParams);
    if (!signal || !signal.direction) return null;

    return {
      signal: signal.direction,
      confidence: signal.confidence,
      strategyId,
      reason: signal.reason ?? `[config] ${strategy.name}`,
      indicators: signal.indicators,
    };
  }

  /**
   * 기존 하드코딩된 전략 선택 로직 (후방호환).
   */
  private selectStrategyDefault(
    candles: Candle[],
    regimeInfo: { regime: MarketRegime; adx: number; direction: number },
  ): StrategyResult | null {
    const { regime } = regimeInfo;

    // 백테스트 결과 기반 전략 선택 (보수적 접근):
    // - ranging (ADX < 25): RSI+BB 54.0% ✅ + SBB-120 (squeeze breakout)
    // - 다른 레짐: 신호 생성 안함 (성과 저조)
    //
    // 횡보장에서만 신호 생성. detectRegime()은 ADX < 25를 'ranging'으로 정의하므로
    // regime 비교만으로 충분하다.

    if (regime !== 'ranging') {
      return null;
    }

    // 횡보장 (ADX < 25)에서 전략 선택:
    // 1차: SBB-120 (squeeze breakout) — 조건이 까다로워 빈도 낮지만 승률 우선
    // 2차: RSI+BB + ZMR-60 consensus/best 모드
    const sbbResult = sbb120Strategy(candles);
    if (sbbResult.signal) {
      return { ...sbbResult, strategyId: 'SBB-120' };
    }

    // RSI+BB 전략 (기본)
    const rsiBBResult = rsiBBBounceStrategy(candles, this.config.highWinRateConfig);
    const noSignal: StrategyResult = {
      signal: null,
      confidence: 0,
      reason: 'No signal',
      indicators: {},
    };

    // ZMR-60 통합 모드 체크
    const mergeMode = this.config.zmr60MergeMode;
    if (mergeMode === 'off') {
      const r = rsiBBResult ?? noSignal;
      return r.signal ? { ...r, strategyId: 'RSI-BB' } : r;
    }

    // ZMR-60 전략 실행
    const zmr60Result = zmr60WithHighWinRateConfig(candles, this.config.highWinRateConfig);

    // null-guard: 전략이 null을 반환할 수 있음
    const rsi = rsiBBResult ?? noSignal;
    const zmr = zmr60Result ?? noSignal;

    if (mergeMode === 'consensus') {
      // 둘 다 같은 방향의 신호를 낼 때만 반환 (승률 극대화)
      if (rsi.signal && zmr.signal && rsi.signal === zmr.signal) {
        // 더 높은 confidence를 선택하되, reason에 consensus 표기
        const chosen = rsi.confidence >= zmr.confidence ? rsi : zmr;
        return {
          ...chosen,
          strategyId: 'RSI-BB+ZMR-60',
          reason: `[consensus] ${chosen.reason}`,
          indicators: {
            ...rsi.indicators,
            ...zmr.indicators,
            zmr60_z: zmr.indicators.z ?? 0,
            rsiBB_confidence: rsi.confidence,
            zmr60_confidence: zmr.confidence,
          },
        };
      }
      // 둘이 다른 방향이거나 하나만 신호 → 신호 없음
      return {
        signal: null,
        confidence: 0,
        reason: 'No consensus between RSI+BB and ZMR-60',
        indicators: {},
      };
    }

    // mergeMode === 'best': 높은 confidence 선택
    if (rsi.signal && zmr.signal) {
      const chosen = rsi.confidence >= zmr.confidence ? rsi : zmr;
      const id = rsi.confidence >= zmr.confidence ? 'RSI-BB' : 'ZMR-60';
      return { ...chosen, strategyId: id };
    }
    // 하나만 신호가 있으면 그것을 반환
    if (rsi.signal) return { ...rsi, strategyId: 'RSI-BB' };
    if (zmr.signal) return { ...zmr, strategyId: 'ZMR-60' };

    return rsi; // 둘 다 null → null 반환
  }

  private passesTrendFilter(
    direction: 'CALL' | 'PUT',
    regimeInfo: { regime: MarketRegime; adx: number; direction: number },
  ): boolean {
    const { regime } = regimeInfo;

    // 강한 추세에서는 추세 방향과 일치하는 신호만 허용
    if (regime === 'strong_uptrend') {
      return direction === 'CALL';
    }
    if (regime === 'strong_downtrend') {
      return direction === 'PUT';
    }

    // 약한 추세에서는 역추세 신호를 약간 허용 (반전 기회)
    // ADX가 30 이상이면 추세 방향만, 미만이면 모두 허용
    if (regimeInfo.adx >= 30) {
      if (regime === 'weak_uptrend' && direction === 'PUT') return false;
      if (regime === 'weak_downtrend' && direction === 'CALL') return false;
    }

    // 횡보장에서는 모든 방향 허용
    return true;
  }

  private createSignal(
    symbol: string,
    strategyResult: StrategyResult,
    regimeInfo: { regime: MarketRegime; adx: number; direction: number },
    candles: Candle[],
  ): Signal {
    const lastCandle = candles[candles.length - 1];

    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      symbol,
      direction: strategyResult.signal!,
      strategyId: strategyResult.strategyId ?? 'UNKNOWN',
      strategy: strategyResult.reason,
      regime: regimeInfo.regime,
      confidence: strategyResult.confidence,
      expiry: strategyResult.expiryOverride ?? this.config.expirySeconds,
      entryPrice: lastCandle.close,
      indicators: {
        adx: regimeInfo.adx,
        trendDirection: regimeInfo.direction,
        ...strategyResult.indicators,
      },
      status: 'pending',
    };
  }
}

// ============================================================
// Helper: Extract default params from Strategy definition
// ============================================================

function getDefaultParams(strategy: BacktestStrategy): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [key, def] of Object.entries(strategy.params)) {
    params[key] = def.default;
  }
  return params;
}

// ============================================================
// Singleton Instance
// ============================================================

let generatorInstance: SignalGeneratorV2 | null = null;

export function getSignalGeneratorV2(config?: Partial<SignalGeneratorV2Config>): SignalGeneratorV2 {
  if (!generatorInstance) {
    generatorInstance = new SignalGeneratorV2(config);
  }
  return generatorInstance;
}

export function resetSignalGeneratorV2(): void {
  generatorInstance = null;
}

// ============================================================
// LLM Report Generator
// ============================================================

export function generateLLMReport(signals: Signal[]): object {
  if (signals.length === 0) {
    return {
      summary: 'No signals generated yet',
      recommendation: 'Wait for market conditions to generate signals',
    };
  }

  const wins = signals.filter((s) => s.status === 'win').length;
  const losses = signals.filter((s) => s.status === 'loss').length;
  const ties = signals.filter((s) => s.status === 'tie').length;
  const pending = signals.filter((s) => s.status === 'pending').length;
  // Policy A: winRate = wins / (wins + losses), ties excluded from denominator
  const decided = wins + losses;
  const winRate = decided > 0 ? ((wins / decided) * 100).toFixed(1) : 'N/A';

  // Strategy breakdown — aggregate by strategyId for stable keys
  const byStrategy: Record<string, { count: number; wins: number; losses: number; ties: number }> =
    {};
  signals.forEach((s) => {
    const key = s.strategyId || 'UNKNOWN';
    if (!byStrategy[key]) byStrategy[key] = { count: 0, wins: 0, losses: 0, ties: 0 };
    byStrategy[key].count++;
    if (s.status === 'win') byStrategy[key].wins++;
    if (s.status === 'loss') byStrategy[key].losses++;
    if (s.status === 'tie') byStrategy[key].ties++;
  });

  // Regime breakdown
  const byRegime: Record<string, { count: number; wins: number; losses: number; ties: number }> =
    {};
  signals.forEach((s) => {
    if (!byRegime[s.regime]) byRegime[s.regime] = { count: 0, wins: 0, losses: 0, ties: 0 };
    byRegime[s.regime].count++;
    if (s.status === 'win') byRegime[s.regime].wins++;
    if (s.status === 'loss') byRegime[s.regime].losses++;
    if (s.status === 'tie') byRegime[s.regime].ties++;
  });

  // Recent signals (last 5)
  const recentSignals = signals.slice(-5).map((s) => ({
    direction: s.direction,
    strategy: s.strategy,
    regime: s.regime,
    confidence: `${(s.confidence * 100).toFixed(0)}%`,
    status: s.status,
    timestamp: new Date(s.timestamp).toLocaleTimeString(),
  }));

  // Best performing strategy
  let bestStrategy = { name: 'N/A', winRate: 0 };
  Object.entries(byStrategy).forEach(([name, stats]) => {
    const totalCompleted = stats.wins + stats.losses;
    if (totalCompleted >= 3) {
      const rate = stats.wins / totalCompleted;
      if (rate > bestStrategy.winRate) {
        bestStrategy = { name, winRate: rate };
      }
    }
  });

  return {
    summary: {
      totalSignals: signals.length,
      completed: decided,
      pending,
      winRate: `${winRate}%`,
      winRatePolicy: 'A: wins/(wins+losses), ties excluded from denominator',
      wins,
      losses,
      ties,
    },
    performance: {
      byStrategy: Object.entries(byStrategy).map(([name, stats]) => ({
        name,
        signals: stats.count,
        winRate:
          stats.wins + stats.losses > 0
            ? `${((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)}%`
            : 'N/A',
      })),
      byRegime: Object.entries(byRegime).map(([name, stats]) => ({
        name,
        signals: stats.count,
        winRate:
          stats.wins + stats.losses > 0
            ? `${((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)}%`
            : 'N/A',
      })),
    },
    recentSignals,
    recommendation: generateRecommendation(winRate, bestStrategy, byRegime),
  };
}

function generateRecommendation(
  winRate: string,
  bestStrategy: { name: string; winRate: number },
  byRegime: Record<string, { count: number; wins: number; losses: number }>,
): string {
  const recommendations: string[] = [];

  // Win rate recommendation
  if (winRate !== 'N/A') {
    const rate = parseFloat(winRate);
    if (rate >= 55) {
      recommendations.push(
        `✅ Win rate ${winRate} is above target (52.1%). Continue current strategy.`,
      );
    } else if (rate >= 50) {
      recommendations.push(`⚠️ Win rate ${winRate} is marginal. Consider tightening filters.`);
    } else {
      recommendations.push(`🔴 Win rate ${winRate} is below breakeven. Review strategy selection.`);
    }
  }

  // Best strategy recommendation
  if (bestStrategy.name !== 'N/A') {
    recommendations.push(
      `🎯 Best performing strategy: ${bestStrategy.name} (${(bestStrategy.winRate * 100).toFixed(1)}%)`,
    );
  }

  // Regime recommendation
  const ranging = byRegime['ranging'];
  if (ranging && ranging.wins + ranging.losses > 0) {
    const rangingRate = ranging.wins / (ranging.wins + ranging.losses);
    if (rangingRate > 0.55) {
      recommendations.push(
        `📊 Ranging market signals performing well (${(rangingRate * 100).toFixed(1)}%)`,
      );
    }
  }

  return recommendations.join('\n');
}

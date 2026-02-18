import { describe, it, expect } from 'vitest';
import {
  extractStrategyConfig,
  extractFromEntries,
  extractMultiSymbolConfig,
  type StrategyConfigFile,
} from './strategy-config';
import type { LeaderboardResult, LeaderboardEntry } from '../backtest/leaderboard-types';
import leaderboardSample from '../../../tests/fixtures/leaderboard-sample.json';

// ============================================================
// Helper: type-safe fixture access
// ============================================================

const sampleResult = leaderboardSample as unknown as LeaderboardResult;
const sampleEntries = sampleResult.entries as unknown as LeaderboardEntry[];

// ============================================================
// extractStrategyConfig
// ============================================================

describe('extractStrategyConfig', () => {
  it('심볼별 상위 3개 전략을 추출한다', () => {
    const config = extractStrategyConfig(sampleResult);

    expect(config.symbols).toBeDefined();
    expect(config.symbols['AAPL-OTC']).toBeDefined();
    expect(config.symbols['AAPL-OTC'].strategies).toHaveLength(3);
    expect(config.symbols['AAPL-OTC'].strategies).toEqual(['rsi-bb', 'rsi-ob-os', 'cci-ob-os']);
  });

  it('전략별 파라미터를 포함한다', () => {
    const config = extractStrategyConfig(sampleResult);
    const aaplConfig = config.symbols['AAPL-OTC'];

    expect(aaplConfig.params['rsi-bb']).toEqual({
      rsiPeriod: 7,
      bbPeriod: 20,
      bbStdDev: 2,
      rsiOversold: 25,
      rsiOverbought: 75,
    });
    expect(aaplConfig.params['rsi-ob-os']).toEqual({
      period: 14,
      oversold: 30,
      overbought: 70,
    });
  });

  it('topN 옵션으로 추출 수를 제어한다', () => {
    const config = extractStrategyConfig(sampleResult, { topN: 1 });
    expect(config.symbols['AAPL-OTC'].strategies).toHaveLength(1);
    expect(config.symbols['AAPL-OTC'].strategies[0]).toBe('rsi-bb');
  });

  it('topN이 엔트리 수보다 크면 가능한 만큼만 반환한다', () => {
    const config = extractStrategyConfig(sampleResult, { topN: 100 });
    expect(config.symbols['AAPL-OTC'].strategies).toHaveLength(5);
  });

  it('dataSource 옵션을 설정할 수 있다', () => {
    const config = extractStrategyConfig(sampleResult, { dataSource: 'demo' });
    expect(config.dataSource).toBe('demo');
  });

  it('generatedAt 필드가 ISO 8601 형식이다', () => {
    const config = extractStrategyConfig(sampleResult);
    expect(() => new Date(config.generatedAt)).not.toThrow();
    expect(new Date(config.generatedAt).toISOString()).toBe(config.generatedAt);
  });

  it('rank 기준으로 정렬한다 (compositeScore가 아닌)', () => {
    const config = extractStrategyConfig(sampleResult);
    // rank 1 = rsi-bb, rank 2 = rsi-ob-os, rank 3 = cci-ob-os
    expect(config.symbols['AAPL-OTC'].strategies[0]).toBe('rsi-bb');
    expect(config.symbols['AAPL-OTC'].strategies[1]).toBe('rsi-ob-os');
    expect(config.symbols['AAPL-OTC'].strategies[2]).toBe('cci-ob-os');
  });
});

// ============================================================
// extractFromEntries
// ============================================================

describe('extractFromEntries', () => {
  it('엔트리 배열에서 직접 추출한다', () => {
    const config = extractFromEntries(sampleEntries, 'EURUSD-OTC');
    expect(config.symbols['EURUSD-OTC']).toBeDefined();
    expect(config.symbols['EURUSD-OTC'].strategies).toHaveLength(3);
  });

  it('빈 엔트리에서는 빈 symbols를 반환한다', () => {
    const config = extractFromEntries([], 'EURUSD-OTC');
    expect(Object.keys(config.symbols)).toHaveLength(0);
  });

  it('minTrades 필터를 적용한다', () => {
    const config = extractFromEntries(sampleEntries, 'TEST', { minTrades: 100 });
    // 100 이상: rsi-bb(120), rsi-ob-os는 95 → 제외
    expect(config.symbols['TEST'].strategies).toHaveLength(1);
    expect(config.symbols['TEST'].strategies[0]).toBe('rsi-bb');
  });
});

// ============================================================
// extractMultiSymbolConfig
// ============================================================

describe('extractMultiSymbolConfig', () => {
  it('여러 LeaderboardResult를 병합한다', () => {
    const result2: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'BTCUSDT' },
    };

    const config = extractMultiSymbolConfig([sampleResult, result2]);
    expect(Object.keys(config.symbols)).toHaveLength(2);
    expect(config.symbols['AAPL-OTC']).toBeDefined();
    expect(config.symbols['BTCUSDT']).toBeDefined();
  });

  it('빈 배열에서는 빈 symbols를 반환한다', () => {
    const config = extractMultiSymbolConfig([]);
    expect(Object.keys(config.symbols)).toHaveLength(0);
  });
});

// ============================================================
// Output format validation
// ============================================================

describe('출력 포맷 검증', () => {
  it('이슈 #73에서 정의한 포맷과 일치한다', () => {
    const config = extractStrategyConfig(sampleResult, { dataSource: 'demo' });

    // 최상위 구조
    expect(config).toHaveProperty('generatedAt');
    expect(config).toHaveProperty('dataSource');
    expect(config).toHaveProperty('symbols');

    // 심볼 구조
    const sym = config.symbols['AAPL-OTC'];
    expect(sym).toHaveProperty('strategies');
    expect(sym).toHaveProperty('params');
    expect(Array.isArray(sym.strategies)).toBe(true);
    expect(typeof sym.params).toBe('object');

    // params의 각 키는 strategies에 포함된 전략 ID
    for (const stratId of Object.keys(sym.params)) {
      expect(sym.strategies).toContain(stratId);
    }
  });

  it('JSON.stringify/parse 라운드트립이 성공한다', () => {
    const config = extractStrategyConfig(sampleResult);
    const json = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(json) as StrategyConfigFile;

    expect(parsed.symbols['AAPL-OTC'].strategies).toEqual(config.symbols['AAPL-OTC'].strategies);
    expect(parsed.symbols['AAPL-OTC'].params).toEqual(config.symbols['AAPL-OTC'].params);
  });
});

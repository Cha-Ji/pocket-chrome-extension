import { describe, it, expect } from 'vitest';
import {
  extractStrategyConfig,
  extractFromEntries,
  extractMultiSymbolConfig,
  type StrategyConfigFile,
} from './strategy-config';
import type { LeaderboardResult, LeaderboardEntry } from '../backtest/leaderboard-types';
import leaderboardSample from '../../../tests/fixtures/leaderboard-sample.json';
import tiedScoresFixture from '../../../tests/fixtures/deterministic-tied-scores.json';
import multiSameSymbolFixture from '../../../tests/fixtures/deterministic-multi-same-symbol.json';

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

// ============================================================
// 결정성 검증 (Determinism Tests)
// ============================================================

const tiedResult = tiedScoresFixture as unknown as LeaderboardResult;
const multiSameSymbol = multiSameSymbolFixture as unknown as LeaderboardResult[];

/** generatedAt 필드를 제거한 비교용 헬퍼 */
function stripGeneratedAt(config: StrategyConfigFile): Omit<StrategyConfigFile, 'generatedAt'> {
  const { generatedAt: _, ...rest } = config;
  return rest;
}

describe('결정성 — tie-breaker', () => {
  it('동일 compositeScore 시 strategyId 오름차순으로 정렬한다', () => {
    // fixture: 3개 전략이 모두 compositeScore=70, rank=0
    const config = extractStrategyConfig(tiedResult, { topN: 3 });
    const strategies = config.symbols['EURUSD-OTC'].strategies;

    // strategyId 오름차순: strategy-a, strategy-b, strategy-c
    expect(strategies).toEqual(['strategy-a', 'strategy-b', 'strategy-c']);
  });

  it('반복 실행해도 동일 결과를 반환한다 (tied scores)', () => {
    const results: ReturnType<typeof stripGeneratedAt>[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(stripGeneratedAt(extractStrategyConfig(tiedResult)));
    }
    // 모든 결과가 첫 번째와 동일해야 함
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  it('입력 배열 순서가 달라도 동일 결과를 반환한다', () => {
    const entriesReversed = [...tiedResult.entries].reverse();
    const resultReversed: LeaderboardResult = {
      ...tiedResult,
      entries: entriesReversed as LeaderboardEntry[],
    };

    const config1 = stripGeneratedAt(extractStrategyConfig(tiedResult));
    const config2 = stripGeneratedAt(extractStrategyConfig(resultReversed));

    expect(config2).toEqual(config1);
  });
});

describe('결정성 — multi 심볼 최신본 선택', () => {
  it('동일 심볼의 여러 결과 중 executedAt이 가장 큰 것을 선택한다', () => {
    // fixture: BTCUSDT 2건 — executedAt 1701000000000 vs 1702592000000
    const config = extractMultiSymbolConfig(multiSameSymbol);

    expect(config.symbols['BTCUSDT']).toBeDefined();
    // 최신본(executedAt=1702592000000)의 전략: new-strategy
    expect(config.symbols['BTCUSDT'].strategies).toEqual(['new-strategy']);
  });

  it('입력 순서를 뒤집어도 동일 결과를 반환한다 (최신본 선택)', () => {
    const forward = stripGeneratedAt(extractMultiSymbolConfig(multiSameSymbol));
    const reversed = stripGeneratedAt(extractMultiSymbolConfig([...multiSameSymbol].reverse()));

    expect(reversed).toEqual(forward);
  });

  it('최신 결과의 entries가 모두 필터링되면 이전 결과로 fallback한다', () => {
    // newer: entries가 있지만 minTrades 필터로 모두 제거됨
    const newerEmpty: LeaderboardResult = {
      ...multiSameSymbol[1], // executedAt=1702592000000
      entries: [{
        ...multiSameSymbol[1].entries[0],
        totalTrades: 5, // minTrades=50 필터에 걸림
      }] as LeaderboardEntry[],
    };
    // older: 유효한 entries 보유
    const olderValid: LeaderboardResult = multiSameSymbol[0]; // executedAt=1701000000000

    const config = extractMultiSymbolConfig([newerEmpty, olderValid], { minTrades: 50 });

    // 최신(newerEmpty)은 필터링 후 비어있으므로, older의 전략이 사용되어야 함
    expect(config.symbols['BTCUSDT']).toBeDefined();
    expect(config.symbols['BTCUSDT'].strategies).toEqual(['old-strategy']);
  });

  it('최신 결과의 entries가 빈 배열이면 이전 결과로 fallback한다', () => {
    const newerNoEntries: LeaderboardResult = {
      ...multiSameSymbol[1],
      entries: [],
    };
    const olderValid: LeaderboardResult = multiSameSymbol[0];

    const config = extractMultiSymbolConfig([newerNoEntries, olderValid]);

    expect(config.symbols['BTCUSDT']).toBeDefined();
    expect(config.symbols['BTCUSDT'].strategies).toEqual(['old-strategy']);
  });

  it('동일 executedAt 시 executionTimeMs로 tie-break한다', () => {
    const sameTime1: LeaderboardResult = {
      ...multiSameSymbol[0],
      executedAt: 1702592000000,
      executionTimeMs: 500,
    };
    const sameTime2: LeaderboardResult = {
      ...multiSameSymbol[1],
      executedAt: 1702592000000,
      executionTimeMs: 1200,
    };

    // executionTimeMs가 큰 sameTime2가 선택되어야 함
    const config1 = stripGeneratedAt(extractMultiSymbolConfig([sameTime1, sameTime2]));
    const config2 = stripGeneratedAt(extractMultiSymbolConfig([sameTime2, sameTime1]));

    expect(config1).toEqual(config2);
    expect(config1.symbols['BTCUSDT'].strategies).toEqual(['new-strategy']);
  });
});

describe('결정성 — 심볼 키 순서 안정성', () => {
  it('multi 병합 시 심볼 키가 알파벳순으로 정렬된다', () => {
    const resultZ: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'ZZZZZ' },
    };
    const resultA: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'AAAAA' },
    };
    const resultM: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'MMMMM' },
    };

    // 의도적으로 역순 입력
    const config = extractMultiSymbolConfig([resultZ, resultA, resultM]);
    const keys = Object.keys(config.symbols);

    expect(keys).toEqual(['AAAAA', 'MMMMM', 'ZZZZZ']);
  });

  it('params 키가 알파벳순으로 정렬된다', () => {
    const config = extractStrategyConfig(sampleResult);
    const params = config.symbols['AAPL-OTC'].params['rsi-bb'];
    const paramKeys = Object.keys(params);

    // 알파벳순: bbPeriod, bbStdDev, rsiOverbought, rsiOversold, rsiPeriod
    expect(paramKeys).toEqual([...paramKeys].sort());
  });

  it('반복 실행 + 다른 입력 순서에서도 JSON 직렬화가 동일하다', () => {
    const resultA: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'AAPL-OTC' },
    };
    const resultB: LeaderboardResult = {
      ...sampleResult,
      config: { ...sampleResult.config, symbol: 'BTCUSDT' },
    };

    const json1 = JSON.stringify(stripGeneratedAt(extractMultiSymbolConfig([resultA, resultB])));
    const json2 = JSON.stringify(stripGeneratedAt(extractMultiSymbolConfig([resultB, resultA])));

    expect(json1).toBe(json2);
  });
});

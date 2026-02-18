// ============================================================
// Strategy Config - Leaderboard 기반 심볼별 전략 설정
// ============================================================
// leaderboard 결과에서 심볼별 상위 전략을 추출하여
// SignalGeneratorV2에 주입하는 설정 타입 및 유틸리티
// ============================================================

import type { LeaderboardEntry, LeaderboardResult } from '../backtest/leaderboard-types';

// ============================================================
// Types
// ============================================================

/** 심볼별 전략 설정 */
export interface SymbolStrategyConfig {
  /** 우선순위 순서의 전략 ID 목록 (최대 3개) */
  strategies: string[];
  /** 전략별 파라미터. 키는 strategyId */
  params: Record<string, Record<string, number>>;
}

/** 전체 전략 설정 (심볼 → 설정 매핑) */
export type StrategyConfigMap = Record<string, SymbolStrategyConfig>;

/** strategy-config.json 파일의 루트 구조 */
export interface StrategyConfigFile {
  /** 생성 시각 (ISO 8601) */
  generatedAt: string;
  /** 데이터 소스 (demo, real, unknown) */
  dataSource: 'demo' | 'real' | 'unknown';
  /** 심볼별 전략 설정 */
  symbols: StrategyConfigMap;
}

// ============================================================
// Extraction Logic
// ============================================================

export interface ExtractOptions {
  /** 심볼별 추출할 최대 전략 수 (기본 3) */
  topN?: number;
  /** 최소 거래 횟수 필터 (기본 0, 이미 leaderboard에서 필터링됨) */
  minTrades?: number;
  /** 데이터 소스 라벨 */
  dataSource?: 'demo' | 'real' | 'unknown';
}

/**
 * LeaderboardResult에서 심볼별 상위 N개 전략을 추출한다.
 *
 * LeaderboardResult는 단일 심볼 백테스트 결과이므로,
 * config.symbol을 키로 사용한다.
 */
export function extractStrategyConfig(
  result: LeaderboardResult,
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;

  const symbol = result.config.symbol;
  const entries = filterAndSort(result.entries, minTrades);
  const topEntries = entries.slice(0, topN);

  const symbolConfig = buildSymbolConfig(topEntries);

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols: symbol && topEntries.length > 0 ? { [symbol]: symbolConfig } : {},
  };
}

/**
 * 여러 LeaderboardResult를 병합하여 멀티 심볼 config를 생성한다.
 *
 * 결정성 규칙:
 * - 동일 심볼이 여러 결과에 존재하면 executedAt이 가장 큰(최신) 것을 우선 선택
 * - executedAt이 같으면 executionTimeMs가 큰(더 오래 실행된 = 더 많은 데이터) 것을 선택
 * - 최신 결과의 entries가 필터링 후 비어있으면, 다음으로 최신인 결과로 fallback
 * - 출력 symbols 객체의 키는 알파벳순으로 정렬
 */
export function extractMultiSymbolConfig(
  results: LeaderboardResult[],
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;

  // 심볼별 결과를 recency 순으로 그룹화 (최신 먼저)
  const resultsBySymbol = new Map<string, LeaderboardResult[]>();
  for (const result of results) {
    const symbol = result.config.symbol;
    if (!symbol) continue;

    const list = resultsBySymbol.get(symbol) ?? [];
    list.push(result);
    resultsBySymbol.set(symbol, list);
  }

  // 각 심볼의 결과 목록을 recency 순으로 정렬 (결정적 tie-breaker 포함)
  for (const list of resultsBySymbol.values()) {
    list.sort((a, b) => compareResultRecency(b, a));
  }

  // 심볼 키를 알파벳순으로 정렬하여 안정적 순서 보장
  const sortedSymbols = [...resultsBySymbol.keys()].sort();
  const symbols: StrategyConfigMap = {};

  for (const symbol of sortedSymbols) {
    const candidates = resultsBySymbol.get(symbol)!;

    // 최신 결과부터 시도하여 유효한 entries가 있는 첫 번째를 사용
    for (const result of candidates) {
      const entries = filterAndSort(result.entries, minTrades);
      const topEntries = entries.slice(0, topN);

      if (topEntries.length > 0) {
        symbols[symbol] = buildSymbolConfig(topEntries);
        break;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols,
  };
}

/**
 * LeaderboardEntry 배열(raw JSON)에서 직접 config를 추출한다.
 * 스크립트에서 사용: leaderboard JSON 파일을 직접 파싱할 때.
 */
export function extractFromEntries(
  entries: LeaderboardEntry[],
  symbol: string,
  options: ExtractOptions = {},
): StrategyConfigFile {
  const { topN = 3, minTrades = 0, dataSource = 'unknown' } = options;

  const filtered = filterAndSort(entries, minTrades);
  const topEntries = filtered.slice(0, topN);
  const symbolConfig = buildSymbolConfig(topEntries);

  return {
    generatedAt: new Date().toISOString(),
    dataSource,
    symbols: topEntries.length > 0 ? { [symbol]: symbolConfig } : {},
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * 결정적 정렬: rank → compositeScore → strategyId (tie-breaker)
 *
 * tie-breaker로 strategyId 오름차순을 사용하여
 * 동일 점수/동일 rank에서도 항상 같은 순서를 보장한다.
 */
function filterAndSort(entries: LeaderboardEntry[], minTrades: number): LeaderboardEntry[] {
  return entries
    .filter((e) => e.totalTrades >= minTrades)
    .sort((a, b) => {
      // rank가 이미 매겨져 있으면 rank 우선
      if (a.rank > 0 && b.rank > 0) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        // 동일 rank → strategyId 오름차순 tie-breaker
        return a.strategyId.localeCompare(b.strategyId);
      }
      // compositeScore 내림차순
      if (b.compositeScore !== a.compositeScore) {
        return b.compositeScore - a.compositeScore;
      }
      // 동일 score → strategyId 오름차순 tie-breaker
      return a.strategyId.localeCompare(b.strategyId);
    });
}

/**
 * 두 결과의 recency를 비교한다 (Array.sort 호환).
 * 양수: a가 더 최신, 0: 동일, 음수: b가 더 최신.
 * 결정적 tie-breaker: executedAt → executionTimeMs → totalStrategies
 */
function compareResultRecency(a: LeaderboardResult, b: LeaderboardResult): number {
  const atDiff = (a.executedAt ?? 0) - (b.executedAt ?? 0);
  if (atDiff !== 0) return atDiff;
  const tmDiff = a.executionTimeMs - b.executionTimeMs;
  if (tmDiff !== 0) return tmDiff;
  return a.totalStrategies - b.totalStrategies;
}

function buildSymbolConfig(entries: LeaderboardEntry[]): SymbolStrategyConfig {
  const strategies: string[] = [];
  const params: Record<string, Record<string, number>> = {};

  for (const entry of entries) {
    strategies.push(entry.strategyId);
    if (entry.params && Object.keys(entry.params).length > 0) {
      // 파라미터 키를 알파벳순으로 정렬하여 결정적 출력 보장
      const sortedParams: Record<string, number> = {};
      for (const key of Object.keys(entry.params).sort()) {
        sortedParams[key] = entry.params[key];
      }
      params[entry.strategyId] = sortedParams;
    }
  }

  return { strategies, params };
}

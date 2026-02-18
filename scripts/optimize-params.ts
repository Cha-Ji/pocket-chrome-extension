/**
 * 파라미터 최적화 스크립트 — train/validation 기반 과최적화 방지
 *
 * 실행:
 *   npx tsx scripts/optimize-params.ts --symbol BTCUSDT
 *   npx tsx scripts/optimize-params.ts --symbol ETHUSDT --source sqlite --ratio 0.8
 *   npx tsx scripts/optimize-params.ts --symbol BTCUSDT --strategies rsi-ob-os,bollinger-bounce --top 3
 *
 * 입력:
 *   --symbol    심볼명 (필수, data 디렉토리의 파일명 기준)
 *   --source    데이터 소스: json(기본) | sqlite
 *   --ratio     train/val 비율 (기본: 0.7)
 *   --strategies 최적화할 전략 ID (콤마 구분, 기본: 등록된 모든 전략)
 *   --top       전략별 상위 N개 파라미터 조합 평가 (기본: 5)
 *   --payout    페이아웃 % (기본: 92)
 *   --expiry    만기 초 (기본: 60)
 *   --verbose   상세 로그
 *
 * 출력:
 *   data/results/optimize-{symbol}-{timestamp}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 백테스트 모듈 임포트 ───
import { getBacktestEngine } from '../src/lib/backtest/engine';
import type { BacktestConfig, Candle, Strategy } from '../src/lib/backtest/types';
import { RSIStrategies } from '../src/lib/backtest/strategies/rsi-strategy';
import { BollingerStrategies } from '../src/lib/backtest/strategies/bollinger-strategy';
import { MACDStrategies } from '../src/lib/backtest/strategies/macd-strategy';
import { StochRSIStrategies } from '../src/lib/backtest/strategies/stochastic-rsi-strategy';
import { SMMAStrategies } from '../src/lib/backtest/strategies/smma-stochastic';
import { ATRStrategies } from '../src/lib/backtest/strategies/atr-breakout-strategy';
import { CCIStrategies } from '../src/lib/backtest/strategies/cci-strategy';
import { WilliamsRStrategies } from '../src/lib/backtest/strategies/williams-r-strategy';
import {
  splitTrainVal,
  extractPerformanceSummary,
  calculateOverfitScore,
  type OptimizationOutput,
  type OptimizationEntry,
} from '../src/lib/backtest/train-val-split';

// ============================================================
// CLI 파싱
// ============================================================

interface CliOptions {
  symbol: string;
  source: 'json' | 'sqlite';
  trainRatio: number;
  strategyIds: string[];
  topN: number;
  payout: number;
  expirySeconds: number;
  verbose: boolean;
}

const BOOLEAN_FLAGS = new Set(['verbose']);

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        opts[key] = 'true';
      } else {
        opts[key] = args[i + 1] || '';
        i++;
      }
    }
  }

  const symbol = opts['symbol'];
  if (!symbol) {
    console.error('사용법: npx tsx scripts/optimize-params.ts --symbol <SYMBOL>');
    console.error('');
    console.error('옵션:');
    console.error('  --symbol      심볼명 (필수)');
    console.error('  --source      json | sqlite (기본: json)');
    console.error('  --ratio       train 비율 (기본: 0.7)');
    console.error('  --strategies  전략 ID 콤마 구분 (기본: 모든 전략)');
    console.error('  --top         상위 N개 파라미터 (기본: 5)');
    console.error('  --payout      페이아웃 % (기본: 92)');
    console.error('  --expiry      만기 초 (기본: 60)');
    console.error('  --verbose     상세 로그');
    process.exit(1);
  }

  return {
    symbol,
    source: (opts['source'] as 'json' | 'sqlite') || 'json',
    trainRatio: parseFloat(opts['ratio'] || '0.7'),
    strategyIds: opts['strategies'] ? opts['strategies'].split(',') : [],
    topN: parseInt(opts['top'] || '5', 10),
    payout: parseFloat(opts['payout'] || '92'),
    expirySeconds: parseInt(opts['expiry'] || '60', 10),
    verbose: 'verbose' in opts,
  };
}

// ============================================================
// 데이터 로드
// ============================================================

function loadCandlesFromJson(symbol: string): Candle[] {
  const dataDir = path.join(__dirname, '..', 'data');
  // 심볼명을 포함하는 JSON 파일 찾기
  const files = fs.readdirSync(dataDir).filter(
    (f) => f.endsWith('.json') && f.toUpperCase().startsWith(symbol.toUpperCase()),
  );

  if (files.length === 0) {
    throw new Error(`JSON 데이터 없음: data/${symbol}*.json`);
  }

  // 가장 작은 타임프레임(1m) 우선, 없으면 첫 번째 파일
  const file = files.find((f) => f.includes('1m')) || files[0];
  console.log(`📂 데이터 로드: data/${file}`);

  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  const arr = raw.candles || raw;

  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`빈 데이터 파일: data/${file}`);
  }

  return arr
    .map((k: Record<string, unknown>) => ({
      timestamp: (k.timestamp as number) || (k as Record<string, unknown>)[0] as number,
      open: +(k.open as number) || parseFloat(String((k as Record<string, unknown>)[1])),
      high: +(k.high as number) || parseFloat(String((k as Record<string, unknown>)[2])),
      low: +(k.low as number) || parseFloat(String((k as Record<string, unknown>)[3])),
      close: +(k.close as number) || parseFloat(String((k as Record<string, unknown>)[4])),
      volume: +(k.volume as number) || parseFloat(String((k as Record<string, unknown>)[5] || '0')),
    }))
    .filter((c: Candle) => c.close > 0 && !isNaN(c.close));
}

function loadCandlesFromSqlite(symbol: string): Candle[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'market-data.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite DB 없음: ${dbPath}`);
  }

  console.log(`📂 SQLite 로드: ${dbPath} (symbol: ${symbol})`);
  const db = new Database(dbPath, { readonly: true });

  // 1m 캐시 캔들 우선 (컬럼: ts_ms, open, high, low, close, volume)
  const cached = db
    .prepare('SELECT ts_ms, open, high, low, close, volume FROM candles_1m WHERE symbol = ? ORDER BY ts_ms ASC')
    .all(symbol.toUpperCase()) as Array<{
      ts_ms: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;

  db.close();

  if (cached.length === 0) {
    throw new Error(`SQLite에서 ${symbol} 데이터 없음 (candles_1m 테이블)`);
  }

  console.log(`  → ${cached.length}개 캔들 로드됨`);
  return cached.map((r) => ({
    timestamp: r.ts_ms > 1e12 ? r.ts_ms : r.ts_ms * 1000, // ms 통일
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

function loadCandles(symbol: string, source: 'json' | 'sqlite'): Candle[] {
  return source === 'sqlite'
    ? loadCandlesFromSqlite(symbol)
    : loadCandlesFromJson(symbol);
}

// ============================================================
// 엔진 초기화 + 전략 등록
// ============================================================

function initEngine(): ReturnType<typeof getBacktestEngine> {
  const engine = getBacktestEngine();
  const allGroups = [
    RSIStrategies,
    BollingerStrategies,
    MACDStrategies,
    StochRSIStrategies,
    SMMAStrategies,
    ATRStrategies,
    CCIStrategies,
    WilliamsRStrategies,
  ];

  // 로그 억제하면서 전략 등록
  const origLog = console.log;
  console.log = () => {};
  const existingIds = new Set(engine.getStrategies().map((s: Strategy) => s.id));
  for (const group of allGroups) {
    for (const s of group) {
      if (!existingIds.has(s.id)) {
        engine.registerStrategy(s);
        existingIds.add(s.id);
      }
    }
  }
  console.log = origLog;

  return engine;
}

// ============================================================
// 최적화 실행
// ============================================================

function runOptimization(opts: CliOptions): void {
  const startTime = Date.now();

  // 1. 엔진 + 데이터 로드
  const engine = initEngine();
  const allStrategies = engine.getStrategies() as Strategy[];
  console.log(`✅ 등록된 전략: ${allStrategies.length}개`);

  const candles = loadCandles(opts.symbol, opts.source);
  console.log(`📊 캔들 데이터: ${candles.length}개`);

  // 2. Train/Val 분할
  const split = splitTrainVal(candles, opts.trainRatio);
  console.log(`✂️  Train/Val 분할: ${split.train.length} / ${split.validation.length}`);
  console.log(
    `   Train: ${new Date(split.trainPeriod.start).toISOString()} ~ ${new Date(split.trainPeriod.end).toISOString()}`,
  );
  console.log(
    `   Val:   ${new Date(split.valPeriod.start).toISOString()} ~ ${new Date(split.valPeriod.end).toISOString()}`,
  );

  // 3. 대상 전략 필터링
  const targetStrategies: Strategy[] =
    opts.strategyIds.length > 0
      ? allStrategies.filter((s) => opts.strategyIds.includes(s.id))
      : allStrategies;

  if (targetStrategies.length === 0) {
    console.error('❌ 일치하는 전략 없음. --strategies 옵션 확인');
    process.exit(1);
  }
  console.log(`🎯 최적화 대상: ${targetStrategies.length}개 전략\n`);

  // 4. 각 전략별 최적화
  const results: OptimizationEntry[] = [];
  const origLog = console.log;

  for (let si = 0; si < targetStrategies.length; si++) {
    const strategy = targetStrategies[si];
    const paramRanges = strategy.params;

    // 파라미터 없으면 기본값으로만 실행
    const hasOptimizableParams = Object.keys(paramRanges).length > 0;

    origLog(`━━━ [${si + 1}/${targetStrategies.length}] ${strategy.name} (${strategy.id}) ━━━`);

    const baseConfig: BacktestConfig = {
      symbol: opts.symbol,
      strategyId: strategy.id,
      strategyParams: Object.fromEntries(
        Object.entries(paramRanges).map(([k, v]) => [k, v.default]),
      ),
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: opts.payout,
      expirySeconds: opts.expirySeconds,
      startTime: split.train[0].timestamp,
      endTime: split.train[split.train.length - 1].timestamp,
    };

    try {
      // --- TRAIN: 그리드 서치 ---
      console.log = () => {}; // 엔진 로그 억제
      let trainResults;

      if (hasOptimizableParams) {
        const ranges: Record<string, { min: number; max: number; step: number }> = {};
        for (const [key, param] of Object.entries(paramRanges)) {
          ranges[key] = { min: param.min, max: param.max, step: param.step };
        }
        trainResults = engine.optimize(baseConfig, split.train, ranges, 'scorecard');
      } else {
        // 파라미터 없는 전략은 기본값으로 한 번만 실행
        const single = engine.run(baseConfig, split.train);
        trainResults = [single];
      }
      console.log = origLog;

      if (trainResults.length === 0) {
        origLog(`  ⏭ 결과 없음 (거래 미발생)`);
        continue;
      }

      // 상위 N개 파라미터 조합
      const topResults = trainResults.slice(0, opts.topN);

      if (opts.verbose) {
        origLog(`  📈 Train 상위 ${topResults.length}개:`);
        for (const r of topResults) {
          origLog(
            `     WR=${r.winRate.toFixed(1)}% PF=${r.profitFactor.toFixed(2)} Trades=${r.totalTrades} Params=${JSON.stringify(r.config.strategyParams)}`,
          );
        }
      }

      // --- VALIDATION: 상위 파라미터로 검증 ---
      const bestTrainResult = topResults[0];
      const bestParams = bestTrainResult.config.strategyParams;

      const valConfig: BacktestConfig = {
        ...baseConfig,
        strategyParams: bestParams,
        startTime: split.validation[0].timestamp,
        endTime: split.validation[split.validation.length - 1].timestamp,
      };

      console.log = () => {};
      const valResult = engine.run(valConfig, split.validation);
      console.log = origLog;

      // --- 성과 비교 ---
      const trainPerf = extractPerformanceSummary(bestTrainResult, opts.payout);
      const valPerf = extractPerformanceSummary(valResult, opts.payout);
      const overfitScore = calculateOverfitScore(trainPerf, valPerf);

      const entry: OptimizationEntry = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        bestParams,
        train: trainPerf,
        validation: valPerf,
        overfitScore,
      };
      results.push(entry);

      // 요약 출력
      const overfitTag =
        overfitScore < 0.3 ? '🟢' : overfitScore < 0.6 ? '🟡' : '🔴';
      origLog(
        `  Train: WR=${trainPerf.winRate.toFixed(1)}% PF=${trainPerf.profitFactor.toFixed(2)} Score=${trainPerf.compositeScore.toFixed(1)}`,
      );
      origLog(
        `  Val:   WR=${valPerf.winRate.toFixed(1)}% PF=${valPerf.profitFactor.toFixed(2)} Score=${valPerf.compositeScore.toFixed(1)}`,
      );
      origLog(`  Overfit: ${overfitTag} ${(overfitScore * 100).toFixed(0)}%`);
      origLog(`  Params: ${JSON.stringify(bestParams)}`);
      origLog('');
    } catch (error) {
      console.log = origLog;
      origLog(`  ❌ 에러: ${error instanceof Error ? error.message : String(error)}`);
      origLog('');
    }
  }

  // 5. 결과 정렬 — val compositeScore 기준 (과적합 패널티 적용)
  results.sort((a, b) => {
    const aScore = a.validation.compositeScore * (1 - a.overfitScore * 0.5);
    const bScore = b.validation.compositeScore * (1 - b.overfitScore * 0.5);
    return bScore - aScore;
  });

  // 6. JSON 출력
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const output: OptimizationOutput = {
    generatedAt: new Date().toISOString(),
    symbol: opts.symbol,
    dataSource: opts.source,
    totalCandles: candles.length,
    trainRatio: opts.trainRatio,
    splitTimestamp: split.splitTimestamp,
    trainPeriod: {
      start: split.trainPeriod.start,
      end: split.trainPeriod.end,
      candles: split.train.length,
    },
    valPeriod: {
      start: split.valPeriod.start,
      end: split.valPeriod.end,
      candles: split.validation.length,
    },
    config: {
      initialBalance: 10000,
      betAmount: 100,
      payout: opts.payout,
      expirySeconds: opts.expirySeconds,
    },
    results,
  };

  const resDir = path.join(__dirname, '..', 'data', 'results');
  if (!fs.existsSync(resDir)) fs.mkdirSync(resDir, { recursive: true });

  const outFile = path.join(resDir, `optimize-${opts.symbol}-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  // 7. 최종 요약
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 최적화 완료 (${elapsed}초)`);
  console.log(`📊 전략: ${results.length}/${targetStrategies.length}개 결과`);
  console.log(`📁 저장: ${outFile}`);

  if (results.length > 0) {
    console.log(`\n🏆 Top 3 (Val Score × Overfit Penalty):`);
    for (const r of results.slice(0, 3)) {
      const adjustedScore = r.validation.compositeScore * (1 - r.overfitScore * 0.5);
      const tag = r.overfitScore < 0.3 ? '🟢' : r.overfitScore < 0.6 ? '🟡' : '🔴';
      console.log(
        `  ${tag} ${r.strategyName}: Val WR=${r.validation.winRate.toFixed(1)}% Score=${adjustedScore.toFixed(1)} Overfit=${(r.overfitScore * 100).toFixed(0)}%`,
      );
    }
  }
}

// ============================================================
// 메인 실행
// ============================================================

const opts = parseArgs();
runOptimization(opts);

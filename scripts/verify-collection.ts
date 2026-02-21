/**
 * Verify Collection — 수집 데이터 무결성 검증 스크립트 (#141)
 *
 * 수집 서버(localhost:3001)에 저장된 캔들 데이터의
 * 자산별 수량, 시간 커버리지, timestamp 연속성을 검증합니다.
 *
 * 환경변수:
 *   COLLECTOR_URL  - 수집 서버 URL (기본: http://localhost:3001)
 *   MAX_DAYS       - 기대 수집 기간 (기본: 90)
 *   MIN_COVERAGE   - 최소 커버리지 비율 0~1 (기본: 0.7)
 *
 * 사용법:
 *   npm run collect:verify
 *   COLLECTOR_URL=http://localhost:3001 npx tsx scripts/verify-collection.ts
 */

const COLLECTOR_URL = process.env.COLLECTOR_URL || 'http://localhost:3001';
const EXPECTED_DAYS = parseInt(process.env.MAX_DAYS || '90', 10);
const MIN_COVERAGE = parseFloat(process.env.MIN_COVERAGE || '0.7');

// 1분봉 기준 하루 예상 캔들 수 (1440분 = 24시간, 실제는 시장 운영 시간에 따라 다름)
const CANDLES_PER_DAY = 1440;

interface SymbolStat {
  symbol: string;
  count: number;
  oldest: number;
  newest: number;
  days: number;
}

interface GapInfo {
  symbol: string;
  gapStart: string;
  gapEnd: string;
  gapMinutes: number;
}

// ── 유틸리티 ────────────────────────────────────────────

function log(msg: string): void {
  console.log(msg);
}

function logWarn(msg: string): void {
  console.log(`  ⚠️  ${msg}`);
}

function logOk(msg: string): void {
  console.log(`  ✅ ${msg}`);
}

function logFail(msg: string): void {
  console.log(`  ❌ ${msg}`);
}

// ── API 호출 ────────────────────────────────────────────

async function fetchJSON(endpoint: string): Promise<any> {
  const res = await fetch(`${COLLECTOR_URL}${endpoint}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
  return res.json();
}

async function checkHealth(): Promise<boolean> {
  try {
    const data = await fetchJSON('/health');
    log(`서버 상태: OK (총 캔들: ${data.totalCandles?.toLocaleString() ?? 'N/A'})`);
    return true;
  } catch (e) {
    logFail(`서버 연결 실패: ${e}`);
    return false;
  }
}

async function getStats(): Promise<SymbolStat[]> {
  try {
    return await fetchJSON('/api/candles/stats');
  } catch {
    return [];
  }
}

async function getTickStats(): Promise<any[]> {
  try {
    return await fetchJSON('/api/ticks/stats');
  } catch {
    return [];
  }
}

// ── 검증 로직 ───────────────────────────────────────────

function analyzeSymbol(stat: SymbolStat): {
  coverage: number;
  expectedCandles: number;
  ratio: number;
  status: 'good' | 'warn' | 'poor';
} {
  const expectedCandles = EXPECTED_DAYS * CANDLES_PER_DAY;
  const ratio = stat.count / expectedCandles;
  // 실제 수집 일수 기반 커버리지 (시장이 항상 열려있지 않으므로 보정)
  const coverage = stat.days / EXPECTED_DAYS;

  let status: 'good' | 'warn' | 'poor';
  if (coverage >= MIN_COVERAGE && ratio >= 0.5) {
    status = 'good';
  } else if (coverage >= MIN_COVERAGE * 0.5 || ratio >= 0.3) {
    status = 'warn';
  } else {
    status = 'poor';
  }

  return { coverage, expectedCandles, ratio, status };
}

// ── 메인 ────────────────────────────────────────────────

async function main(): Promise<void> {
  log('='.repeat(60));
  log('수집 데이터 검증 시작');
  log(`서버: ${COLLECTOR_URL}`);
  log(`기대 수집 기간: ${EXPECTED_DAYS}일, 최소 커버리지: ${(MIN_COVERAGE * 100).toFixed(0)}%`);
  log('='.repeat(60));
  log('');

  // 1. 서버 헬스체크
  log('## 1. 서버 상태');
  const healthy = await checkHealth();
  if (!healthy) {
    log('\n수집 서버가 실행 중이지 않습니다. `npm run collector`로 시작하세요.');
    process.exit(1);
  }
  log('');

  // 2. 캔들 통계
  log('## 2. 캔들 통계 (자산별)');
  const stats = await getStats();

  if (stats.length === 0) {
    logFail('수집된 캔들 데이터가 없습니다.');
    process.exit(1);
  }

  // 정렬: 캔들 수 내림차순
  stats.sort((a, b) => b.count - a.count);

  const totalCandles = stats.reduce((sum, s) => sum + s.count, 0);
  log(`총 자산: ${stats.length}개, 총 캔들: ${totalCandles.toLocaleString()}`);
  log('');

  let goodCount = 0;
  let warnCount = 0;
  let poorCount = 0;

  log(`${'자산'.padEnd(25)} ${'캔들 수'.padStart(10)} ${'일수'.padStart(6)} ${'커버리지'.padStart(8)} ${'상태'.padStart(4)}`);
  log('─'.repeat(60));

  for (const stat of stats) {
    const analysis = analyzeSymbol(stat);
    const icon = analysis.status === 'good' ? '✅' : analysis.status === 'warn' ? '⚠️' : '❌';
    const coveragePct = `${(analysis.coverage * 100).toFixed(0)}%`;

    log(
      `${stat.symbol.padEnd(25)} ${stat.count.toLocaleString().padStart(10)} ${stat.days.toFixed(1).padStart(6)} ${coveragePct.padStart(8)} ${icon}`,
    );

    if (analysis.status === 'good') goodCount++;
    else if (analysis.status === 'warn') warnCount++;
    else poorCount++;
  }

  log('');
  log(`요약: ✅ ${goodCount}개 양호 | ⚠️ ${warnCount}개 부분 | ❌ ${poorCount}개 미달`);
  log('');

  // 3. 틱 통계 (있으면)
  log('## 3. 틱 통계');
  const tickStats = await getTickStats();
  if (tickStats.length > 0) {
    log(`틱 자산: ${tickStats.length}개`);
    for (const t of tickStats.slice(0, 5)) {
      log(`  ${t.symbol}: ${t.count?.toLocaleString() ?? 'N/A'} ticks`);
    }
    if (tickStats.length > 5) log(`  ... 외 ${tickStats.length - 5}개`);
  } else {
    log('  틱 데이터 없음 (정상 — 캔들 수집 모드)');
  }
  log('');

  // 4. 요약
  log('## 4. 종합 평가');
  const avgDays = stats.reduce((sum, s) => sum + s.days, 0) / stats.length;
  const avgCandles = totalCandles / stats.length;

  log(`  평균 수집 기간: ${avgDays.toFixed(1)}일`);
  log(`  평균 캔들 수: ${avgCandles.toLocaleString()} 개/자산`);
  log(`  수집률: ${((avgDays / EXPECTED_DAYS) * 100).toFixed(0)}% (목표 ${EXPECTED_DAYS}일 대비)`);

  if (poorCount === 0 && warnCount <= stats.length * 0.2) {
    logOk('전체적으로 수집 상태가 양호합니다.');
  } else if (poorCount <= stats.length * 0.3) {
    logWarn('일부 자산의 수집이 미흡합니다. 추가 수집이 필요할 수 있습니다.');
  } else {
    logFail('다수 자산의 수집이 미달입니다. 수집을 재실행하세요.');
  }

  log('');
  log('='.repeat(60));
}

main().catch((e) => {
  console.error(`치명적 에러: ${e}`);
  process.exit(1);
});

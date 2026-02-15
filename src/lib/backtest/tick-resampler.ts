// ============================================================
// Tick Resampler
// ============================================================
// SQLite에 저장된 tick 데이터(0.2~0.7초 간격)를
// 지정 interval의 OHLCV 캔들로 리샘플링하는 유틸리티.
//
// PO(Pocket Option) OTC 자산의 tick은 OHLC가 동일하고
// volume=0이며, timestamp가 초 단위 소수점(예: 1770566065.342).
// 페이아웃 데이터(0~100 범위)가 섞여 있을 수 있어 필터링 필요.
// ============================================================

/** SQLite에서 읽어온 tick 행 */
export interface TickRow {
  symbol: string;
  timestamp: number; // 초 단위 (소수점 가능)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

/** 리샘플링된 OHLCV 캔들 */
export interface ResampledCandle {
  timestamp: number; // ms 단위, interval 시작 시점
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // tick 수
}

/** 리샘플링 옵션 */
export interface ResampleOptions {
  /** 캔들 interval 크기 (초 단위). 기본 60 (1분봉) */
  intervalSeconds?: number;
  /** 최소 tick 수. 이보다 적은 tick의 캔들은 제외. 기본 1 */
  minTicksPerCandle?: number;
  /** 페이아웃 데이터 필터링 여부. 기본 true */
  filterPayout?: boolean;
}

// 기본 옵션값
const DEFAULT_OPTIONS: Required<ResampleOptions> = {
  intervalSeconds: 60,
  minTicksPerCandle: 1,
  filterPayout: true,
};

/**
 * 페이아웃 데이터인지 판별한다.
 *
 * 페이아웃 데이터의 특징:
 * - OHLC가 모두 동일하며 0~100 범위 (퍼센트 값)
 * - source가 'realtime'이면 추가 의심
 *
 * @param row - tick 데이터 행
 * @returns 페이아웃 데이터이면 true
 */
export function isPayoutData(row: TickRow): boolean {
  const { open, high, low, close, source } = row;

  // OHLC가 모두 동일한지 확인
  const allEqual = open === high && high === low && low === close;

  if (!allEqual) {
    return false;
  }

  // 0~100 범위인지 확인 (페이아웃 퍼센트)
  const inPayoutRange = open >= 0 && open <= 100;

  if (!inPayoutRange) {
    return false;
  }

  // source가 'realtime'이면 페이아웃일 가능성이 더 높음
  // 하지만 source와 무관하게 위 조건을 만족하면 페이아웃으로 판단
  if (source === 'realtime') {
    return true;
  }

  // source가 realtime이 아니더라도 OHLC 동일 + 0~100이면 페이아웃 의심
  return true;
}

/**
 * 심볼명을 정규화한다.
 *
 * 변환 규칙:
 * - 앞의 '#' 제거
 * - '_' → '-' 변환
 * - 대문자로 통일
 *
 * @param symbol - 원본 심볼명 (예: '#AAPL_OTC')
 * @returns 정규화된 심볼명 (예: 'AAPL-OTC')
 */
export function normalizeSymbol(symbol: string): string {
  return symbol
    .replace(/^#/, '') // 앞의 '#' 제거
    .replace(/_/g, '-') // '_' → '-' 변환
    .toUpperCase(); // 대문자로 통일
}

/**
 * tick 데이터를 지정 interval의 OHLCV 캔들로 리샘플링한다.
 *
 * tick 데이터는 0.2~0.7초 간격이며 OHLC가 모두 동일(tick이므로).
 * intervalSeconds(기본 60초) 단위로 그룹핑하여:
 * - open = 첫 번째 tick의 open
 * - high = 모든 tick의 high 중 최대값
 * - low = 모든 tick의 low 중 최소값
 * - close = 마지막 tick의 close
 * - volume = interval 내 tick 수
 *
 * @param ticks - SQLite에서 읽어온 tick 배열 (정렬 불필요)
 * @param options - 리샘플링 옵션
 * @returns 리샘플링된 캔들 배열 (timestamp 오름차순)
 */
export function resampleTicks(ticks: TickRow[], options?: ResampleOptions): ResampledCandle[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (ticks.length === 0) {
    return [];
  }

  // 1. 페이아웃 데이터 필터링
  let filteredTicks: TickRow[];
  if (opts.filterPayout) {
    filteredTicks = ticks.filter((tick) => !isPayoutData(tick));
  } else {
    filteredTicks = ticks;
  }

  if (filteredTicks.length === 0) {
    return [];
  }

  // 2. timestamp 오름차순 정렬 (원본 배열 변경하지 않음)
  const sorted = [...filteredTicks].sort((a, b) => a.timestamp - b.timestamp);

  // 3. interval별 그룹핑
  //    timestamp는 초 단위이므로 intervalSeconds로 나누어 bucket 결정
  const intervalSec = opts.intervalSeconds;
  const buckets = new Map<number, TickRow[]>();

  for (const tick of sorted) {
    // interval 시작 시점 계산 (초 단위, floor)
    const bucketStart = Math.floor(tick.timestamp / intervalSec) * intervalSec;
    const bucket = buckets.get(bucketStart);
    if (bucket) {
      bucket.push(tick);
    } else {
      buckets.set(bucketStart, [tick]);
    }
  }

  // 4. 각 bucket을 캔들로 변환
  const candles: ResampledCandle[] = [];

  for (const [bucketStart, bucketTicks] of buckets) {
    // 최소 tick 수 검사
    if (bucketTicks.length < opts.minTicksPerCandle) {
      continue;
    }

    const firstTick = bucketTicks[0];
    const lastTick = bucketTicks[bucketTicks.length - 1];

    let high = -Infinity;
    let low = Infinity;

    for (const tick of bucketTicks) {
      if (tick.high > high) high = tick.high;
      if (tick.low < low) low = tick.low;
    }

    candles.push({
      timestamp: bucketStart * 1000, // 초 → ms 변환
      open: firstTick.open,
      high,
      low,
      close: lastTick.close,
      volume: bucketTicks.length,
    });
  }

  // 5. timestamp 오름차순 정렬
  candles.sort((a, b) => a.timestamp - b.timestamp);

  return candles;
}

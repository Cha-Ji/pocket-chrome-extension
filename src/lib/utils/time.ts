// ============================================================
// Timestamp Normalization Utility
// ============================================================
// DB 저장 기준을 ms 정수(ts_ms)로 통일하기 위한 정규화 함수.
//
// 입력 형태와 무관하게 항상 ms 정수를 반환한다:
// - 1e12 이상 → 이미 ms (정수 반환)
// - 소수점 → sec로 판단 → *1000 후 Math.floor
// - 그 외 정수 → sec로 판단 → *1000
// ============================================================

/**
 * 임의 형태의 timestamp를 ms 정수로 정규화한다.
 *
 * @param input - number 또는 문자열 형태의 timestamp
 * @returns 정수 ms timestamp
 * @throws input이 유효한 숫자가 아닌 경우
 *
 * @example
 * toEpochMs(1770566065)       // → 1770566065000  (sec → ms)
 * toEpochMs(1770566065.342)   // → 1770566065342  (sec+소수 → ms)
 * toEpochMs(1770566065342)    // → 1770566065342  (이미 ms)
 * toEpochMs('1770566065')     // → 1770566065000  (문자열 sec)
 */
export function toEpochMs(input: number | string): number {
  if (typeof input === 'string' && input.trim() === '') {
    throw new Error(`invalid timestamp: ${input}`);
  }

  const n = typeof input === 'string' ? Number(input) : input;

  if (!Number.isFinite(n)) {
    throw new Error(`invalid timestamp: ${input}`);
  }

  // 소수점이 있으면 sec로 취급 → ms 변환
  if (!Number.isInteger(n)) {
    return Math.floor(n * 1000);
  }

  // 13자리 이상: 이미 ms
  if (n >= 1e12) {
    return n;
  }

  // 그 외: sec → ms
  return n * 1000;
}

/**
 * ms timestamp를 sec(소수) timestamp로 변환한다.
 * 리샘플러 등 초 단위가 필요한 곳에서 사용.
 *
 * @param tsMs - ms 정수 timestamp
 * @returns 초 단위 timestamp (소수)
 */
export function toEpochSec(tsMs: number): number {
  return tsMs / 1000;
}

/**
 * timestamp가 ms 단위인지 판별한다.
 *
 * @param ts - 판별 대상 timestamp
 * @returns ms이면 true
 */
export function isMilliseconds(ts: number): boolean {
  return ts >= 1e12;
}

/**
 * timestamp 배열에서 단위 혼재 여부를 진단한다.
 *
 * @param timestamps - 진단 대상 timestamp 배열
 * @returns 진단 결과 (단위별 개수, 혼재 여부)
 */
export function diagnoseTimestamps(timestamps: number[]): {
  totalCount: number;
  msCount: number;
  secCount: number;
  secFloatCount: number;
  isMixed: boolean;
  recommendation: string;
} {
  let msCount = 0;
  let secCount = 0;
  let secFloatCount = 0;

  for (const ts of timestamps) {
    if (!Number.isInteger(ts)) {
      secFloatCount++;
    } else if (ts >= 1e12) {
      msCount++;
    } else {
      secCount++;
    }
  }

  const distinctTypes = [msCount, secCount, secFloatCount].filter((c) => c > 0).length;
  const isMixed = distinctTypes > 1;

  let recommendation: string;
  if (!isMixed) {
    recommendation = 'Timestamps are uniform. No migration needed.';
  } else {
    recommendation = `Mixed timestamps detected: ${msCount} ms, ${secCount} sec(int), ${secFloatCount} sec(float). Run migration to normalize all to ms.`;
  }

  return {
    totalCount: timestamps.length,
    msCount,
    secCount,
    secFloatCount,
    isMixed,
    recommendation,
  };
}

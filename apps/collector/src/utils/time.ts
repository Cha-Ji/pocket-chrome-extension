// ============================================================
// Timestamp Normalization Utility
// ============================================================
// Inlined from src/lib/utils/time.ts to decouple collector from extension code.
// DB 저장 기준을 ms 정수(ts_ms)로 통일하기 위한 정규화 함수.

/**
 * 임의 형태의 timestamp를 ms 정수로 정규화한다.
 *
 * - 1e12 이상 → 이미 ms (정수 반환)
 * - 소수점 → sec로 판단 → *1000 후 Math.floor
 * - 그 외 정수 → sec로 판단 → *1000
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

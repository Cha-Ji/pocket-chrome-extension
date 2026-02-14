// ============================================================
// Symbol & Timestamp Normalization Utilities
// ============================================================
// 프로젝트 전역에서 사용하는 정규화 함수.
// WebSocket / DOM / History 간 키 불일치를 방지한다.
// ============================================================

/**
 * 원시 심볼 문자열을 프로젝트 표준 키로 정규화한다.
 *
 * 규칙:
 *  1. trim
 *  2. leading '#' 제거
 *  3. spaces / underscores → '-'
 *  4. suffix '_otc' (대소문자 무관) → '-OTC'
 *  5. uppercase
 *
 * 예시:
 *  '#eurusd_otc' → 'EURUSD-OTC'
 *  'EUR USD'     → 'EUR-USD'
 *  'btcusdt'     → 'BTCUSDT'
 */
export function normalizeSymbol(raw: string): string {
  let s = raw.trim()
  // leading '#' 제거
  if (s.startsWith('#')) s = s.slice(1)
  // slashes / spaces / underscores → '-'
  s = s.replace(/[/\s_]+/g, '-')
  // suffix '-otc' (대소문자 무관) → '-OTC' (정규화 전 uppercase 하면 중복 처리되므로 여기서 처리)
  s = s.replace(/-?otc$/i, '-OTC')
  // uppercase
  s = s.toUpperCase()
  return s
}

/**
 * WebSocket timestamp를 밀리초 단위로 정규화한다.
 *
 * 규칙:
 *  - ts < 1e12 이면 초 단위로 간주하고 ts * 1000
 *  - 그 외에는 이미 밀리초로 간주하고 그대로 반환
 */
export function normalizeTimestampMs(ts: number): number {
  if (ts < 1e12) return ts * 1000
  return ts
}

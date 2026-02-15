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
 *  3. OTC suffix를 먼저 감지/분리 (대소문자 무관)
 *  4. separators (/ - _ space) 제거 → 연속 문자열
 *  5. UPPERCASE
 *  6. OTC suffix 재부착 (있었다면 '-OTC')
 *
 * 예시:
 *  '#eurusd_otc' → 'EURUSD-OTC'
 *  'EUR/USD'     → 'EURUSD'
 *  'EUR USD'     → 'EURUSD'
 *  'eur_usd'     → 'EURUSD'
 *  'EURUSD'      → 'EURUSD'
 *  'btcusdt'     → 'BTCUSDT'
 *  'Alibaba OTC' → 'ALIBABA-OTC'
 */
export function normalizeSymbol(raw: string): string {
  let s = raw.trim();
  // leading '#' 제거
  if (s.startsWith('#')) s = s.slice(1);

  // OTC suffix 감지 및 분리 ([-_ ]?otc$ 패턴)
  const isOTC = /[-_ ]?otc$/i.test(s);
  if (isOTC) s = s.replace(/[-_ ]?otc$/i, '');

  // 모든 separators 제거 (/, -, _, space)
  s = s.replace(/[/\-\s_]+/g, '');

  // uppercase
  s = s.toUpperCase();

  // OTC suffix 재부착
  if (isOTC) s += '-OTC';

  return s;
}

/**
 * WebSocket timestamp를 밀리초 단위로 정규화한다.
 *
 * 규칙:
 *  - ts < 1e12 이면 초 단위로 간주하고 ts * 1000
 *  - 그 외에는 이미 밀리초로 간주하고 그대로 반환
 */
export function normalizeTimestampMs(ts: number): number {
  if (ts < 1e12) return ts * 1000;
  return ts;
}

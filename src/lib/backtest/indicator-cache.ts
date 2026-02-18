// ============================================================
// Indicator Cache for Backtest Engine
// ============================================================
// 백테스트 실행 중 동일 지표의 반복 계산을 방지하는 캐시 레이어.
// 전체 캔들 데이터에 대해 한 번만 계산하고, prefix slice로 반환.
// ============================================================

import type { Candle } from './types';
import { type IIndicatorCacheStore, setActiveIndicatorCache } from '../indicators/index';

/**
 * 백테스트 한 번의 run() 범위에서만 유효한 지표 캐시.
 * activate() → 엔진 루프 → deactivate() 패턴으로 사용.
 */
export class IndicatorCache implements IIndicatorCacheStore {
  cache: Map<string, unknown> = new Map();
  fullCloses: number[];
  fullHighs: number[];
  fullLows: number[];

  constructor(candles: Candle[]) {
    this.fullCloses = candles.map((c) => c.close);
    this.fullHighs = candles.map((c) => c.high);
    this.fullLows = candles.map((c) => c.low);
  }

  /**
   * 이 캐시를 활성화하여 모든 지표 .calculate() 호출이 캐시를 사용하도록 함
   */
  activate(): void {
    setActiveIndicatorCache(this);
  }

  /**
   * 캐시 비활성화 + 메모리 해제
   */
  deactivate(): void {
    setActiveIndicatorCache(null);
    this.cache.clear();
  }
}

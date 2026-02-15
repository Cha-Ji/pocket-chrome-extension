// ============================================================
// Platform Registry - 어댑터 자동 감지 및 관리
// ============================================================

import type { IPlatformAdapter, IPlatformDetector } from './interfaces';

class PlatformRegistry {
  private detectors: IPlatformDetector[] = [];
  private activeAdapter: IPlatformAdapter | null = null;

  /**
   * 플랫폼 감지기 등록
   * 여러 플랫폼 지원 시 각각 등록한다.
   */
  register(detector: IPlatformDetector): void {
    // 중복 등록 방지
    if (this.detectors.some((d) => d.platformId === detector.platformId)) {
      console.warn(`[PlatformRegistry] Detector already registered: ${detector.platformId}`);
      return;
    }
    this.detectors.push(detector);
  }

  /**
   * 등록된 감지기 제거
   */
  unregister(platformId: string): void {
    this.detectors = this.detectors.filter((d) => d.platformId !== platformId);
  }

  /**
   * 현재 페이지에서 플랫폼 자동 감지 → 가장 확신도 높은 어댑터 반환
   */
  detect(url: string, doc: Document): IPlatformAdapter | null {
    let bestDetector: IPlatformDetector | null = null;
    let bestScore = 0;

    for (const detector of this.detectors) {
      const score = detector.detect(url, doc);
      if (score > bestScore) {
        bestScore = score;
        bestDetector = detector;
      }
    }

    if (bestDetector && bestScore > 0) {
      return bestDetector.createAdapter();
    }

    return null;
  }

  /**
   * 감지 + 초기화까지 한 번에 수행
   */
  async detectAndInitialize(url: string, doc: Document): Promise<IPlatformAdapter | null> {
    // 기존 어댑터가 있으면 정리
    if (this.activeAdapter) {
      this.activeAdapter.dispose();
      this.activeAdapter = null;
    }

    const adapter = this.detect(url, doc);
    if (!adapter) {
      console.warn('[PlatformRegistry] No platform detected for:', url);
      return null;
    }

    try {
      await adapter.initialize();
      this.activeAdapter = adapter;
      console.log(
        `[PlatformRegistry] Initialized: ${adapter.platformName} (${adapter.platformId})`,
      );
      return adapter;
    } catch (error) {
      console.error(`[PlatformRegistry] Failed to initialize ${adapter.platformId}:`, error);
      return null;
    }
  }

  /**
   * 현재 활성 어댑터 반환
   */
  getActiveAdapter(): IPlatformAdapter | null {
    return this.activeAdapter;
  }

  /**
   * 등록된 모든 플랫폼 ID 목록
   */
  getRegisteredPlatforms(): string[] {
    return this.detectors.map((d) => d.platformId);
  }

  /**
   * 정리 (확장 프로그램 종료 시)
   */
  dispose(): void {
    if (this.activeAdapter) {
      this.activeAdapter.dispose();
      this.activeAdapter = null;
    }
  }
}

// 싱글톤
let registryInstance: PlatformRegistry | null = null;

export function getPlatformRegistry(): PlatformRegistry {
  if (!registryInstance) {
    registryInstance = new PlatformRegistry();
  }
  return registryInstance;
}

export { PlatformRegistry };

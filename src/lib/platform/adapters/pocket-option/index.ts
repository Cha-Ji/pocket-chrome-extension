// ============================================================
// Pocket Option Demo Adapter - IPlatformAdapter 구현
// ============================================================
// 기존 content-script 모듈들을 Platform Adapter 인터페이스로 래핑.
// 새 플랫폼 추가 시 이 파일을 참고하여 동일한 인터페이스를 구현한다.
// ============================================================

import type {
  IPlatformAdapter,
  IPlatformDetector,
  IDataSource,
  IExecutor,
  ISafetyGuard,
} from '../../interfaces'
import { PocketOptionDataSource } from './data-source'
import { PocketOptionExecutor } from './executor'
import { PocketOptionSafetyGuard } from './safety'
import { PO_DOMAINS } from './selectors'

export class PocketOptionDemoAdapter implements IPlatformAdapter {
  readonly platformId = 'pocket-option-demo'
  readonly platformName = 'Pocket Option (Demo)'

  private _dataSource: PocketOptionDataSource
  private _executor: PocketOptionExecutor
  private _safety: PocketOptionSafetyGuard
  private _isReady = false

  constructor() {
    this._dataSource = new PocketOptionDataSource()
    this._executor = new PocketOptionExecutor()
    this._safety = new PocketOptionSafetyGuard()
  }

  get dataSource(): IDataSource {
    return this._dataSource
  }
  get executor(): IExecutor {
    return this._executor
  }
  get safety(): ISafetyGuard {
    return this._safety
  }
  get isReady(): boolean {
    return this._isReady
  }

  async initialize(): Promise<void> {
    // DOM 준비 대기
    await this.waitForDOM()

    // 안전장치 감시 시작
    this._safety.startWatching()

    // 데이터 수집 시작
    this._dataSource.start()

    // 초기 페이아웃 로드
    this._dataSource.refreshPayouts()

    this._isReady = true
    console.log(`[${this.platformId}] Adapter initialized`)
  }

  dispose(): void {
    this._dataSource.stop()
    this._safety.stopWatching()
    this._isReady = false
    console.log(`[${this.platformId}] Adapter disposed`)
  }

  /** DOM이 거래 가능 상태가 될 때까지 대기 (최대 10초) */
  private async waitForDOM(timeoutMs = 10_000): Promise<void> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const check = () => {
        // 차트 컨테이너가 있으면 준비 완료
        if (document.querySelector('.chart-item, .chart-block')) {
          resolve()
          return
        }

        if (Date.now() - startTime > timeoutMs) {
          // 타임아웃이어도 진행 (데이터 없이 시작)
          console.warn(`[${this.platformId}] DOM wait timeout, proceeding anyway`)
          resolve()
          return
        }

        requestAnimationFrame(check)
      }
      check()
    })
  }
}

// ============================================================
// Detector
// ============================================================

export class PocketOptionDetector implements IPlatformDetector {
  readonly platformId = 'pocket-option-demo'

  detect(url: string, doc: Document): number {
    let score = 0

    // 도메인 매칭
    const hostname = this.extractHostname(url)
    const matchesDomain = PO_DOMAINS.some((d) => hostname.includes(d))
    if (!matchesDomain) return 0

    score += 0.5

    // URL에 'demo' 포함
    if (url.includes('demo')) {
      score += 0.3
    }

    // DOM에 PO 고유 요소 존재
    if (
      doc.querySelector('.chart-item') ||
      doc.querySelector('.balance-info-block')
    ) {
      score += 0.2
    }

    return Math.min(score, 1)
  }

  createAdapter(): IPlatformAdapter {
    return new PocketOptionDemoAdapter()
  }

  private extractHostname(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }
}

// Re-export for convenience
export { PocketOptionDataSource } from './data-source'
export { PocketOptionExecutor } from './executor'
export { PocketOptionSafetyGuard } from './safety'
export { PO_DOMAINS } from './selectors'

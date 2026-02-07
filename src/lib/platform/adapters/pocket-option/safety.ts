// ============================================================
// Pocket Option Safety Guard - ISafetyGuard 구현
// ============================================================
// 기존 isDemoMode(), getAccountType() 로직을 ISafetyGuard로 래핑.
// PO Real 어댑터는 이 클래스를 상속하여 추가 안전장치를 적용한다.
// ============================================================

import type { AccountType } from '../../../types'
import type { ISafetyGuard, Confidence, Unsubscribe } from '../../interfaces'
import { PO_DEMO_SELECTORS, PO_DEMO_DETECTION } from './selectors'

export class PocketOptionSafetyGuard implements ISafetyGuard {
  private accountTypeCallbacks: ((type: AccountType) => void)[] = []
  private lastKnownType: AccountType = 'UNKNOWN'
  private watchInterval: ReturnType<typeof setInterval> | null = null

  /** 데모/리얼 상태를 주기적으로 확인하여 변경 감지 시작 */
  startWatching(intervalMs = 5000): void {
    this.lastKnownType = this.getAccountType().type
    this.watchInterval = setInterval(() => {
      const current = this.getAccountType().type
      if (current !== this.lastKnownType) {
        this.lastKnownType = current
        this.accountTypeCallbacks.forEach((cb) => cb(current))
      }
    }, intervalMs)
  }

  /** 감시 중지 */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval)
      this.watchInterval = null
    }
  }

  getAccountType(): { type: AccountType; confidence: Confidence } {
    const urlHasDemo = window.location.pathname.includes('demo')
    const hasChartDemoClass = !!document.querySelector(
      PO_DEMO_DETECTION.demoChartClass,
    )
    const labelText =
      document
        .querySelector(PO_DEMO_DETECTION.balanceLabel)
        ?.textContent?.toLowerCase() || ''
    const labelHasDemo = labelText.includes('demo')

    // 3개 다 일치 → high confidence
    if (urlHasDemo && hasChartDemoClass && labelHasDemo) {
      return { type: 'DEMO', confidence: 'high' }
    }

    // URL만 demo → medium
    if (urlHasDemo) {
      return { type: 'DEMO', confidence: 'medium' }
    }

    // URL도 아니고 label도 아니면 → LIVE
    if (!urlHasDemo && !labelHasDemo) {
      return { type: 'LIVE', confidence: 'medium' }
    }

    return { type: 'UNKNOWN', confidence: 'low' }
  }

  isDemoMode(): boolean {
    // URL 체크
    if (window.location.pathname.includes('demo')) return true

    // CSS 클래스 체크
    if (document.querySelector(PO_DEMO_DETECTION.demoChartClass)) return true

    // 라벨 텍스트 체크
    const label = document.querySelector(PO_DEMO_SELECTORS.demoIndicator)
    if (label?.textContent?.toLowerCase().includes('demo')) return true

    // 확실하지 않으면 false (= LIVE 가정, 거래 차단)
    return false
  }

  onAccountTypeChange(callback: (type: AccountType) => void): Unsubscribe {
    this.accountTypeCallbacks.push(callback)
    return () => {
      this.accountTypeCallbacks = this.accountTypeCallbacks.filter(
        (cb) => cb !== callback,
      )
    }
  }

  canExecuteTrade(amount: number): { allowed: boolean; reason?: string } {
    if (!this.isDemoMode()) {
      return {
        allowed: false,
        reason: 'Demo mode required - real money protection active',
      }
    }

    if (amount <= 0) {
      return { allowed: false, reason: 'Trade amount must be positive' }
    }

    return { allowed: true }
  }
}

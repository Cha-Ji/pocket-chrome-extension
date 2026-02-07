import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PayoutMonitor, AssetPayout, PayoutFilter } from './payout-monitor'

// loggers 모킹 (payout-monitor에서 사용)
vi.mock('../lib/logger', () => ({
  loggers: {
    monitor: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// dom-utils 모킹
vi.mock('../lib/dom-utils', () => ({
  forceClick: vi.fn().mockResolvedValue(undefined),
}))

describe('PayoutMonitor', () => {
  let monitor: PayoutMonitor

  beforeEach(() => {
    vi.clearAllMocks()
    monitor = new PayoutMonitor({ minPayout: 92, onlyOTC: true })
  })

  // ============================================================
  // 페이아웃 필터링 로직
  // ============================================================

  describe('페이아웃 필터링 - getHighPayoutAssets', () => {
    it('minPayout 이상인 자산만 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })
      assets.set('ETH OTC', { name: 'ETH OTC', payout: 92, isOTC: true, lastUpdated: Date.now() })
      assets.set('XRP OTC', { name: 'XRP OTC', payout: 88, isOTC: true, lastUpdated: Date.now() })

      const highPayout = monitor.getHighPayoutAssets()
      expect(highPayout).toHaveLength(2)
      expect(highPayout.every(a => a.payout >= 92)).toBe(true)
    })

    it('payout 내림차순으로 정렬한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('ETH OTC', { name: 'ETH OTC', payout: 92, isOTC: true, lastUpdated: Date.now() })
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 96, isOTC: true, lastUpdated: Date.now() })
      assets.set('SOL OTC', { name: 'SOL OTC', payout: 94, isOTC: true, lastUpdated: Date.now() })

      const highPayout = monitor.getHighPayoutAssets()
      expect(highPayout[0].payout).toBe(96)
      expect(highPayout[1].payout).toBe(94)
      expect(highPayout[2].payout).toBe(92)
    })

    it('onlyOTC가 true이면 OTC 자산만 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })
      assets.set('EURUSD', { name: 'EURUSD', payout: 95, isOTC: false, lastUpdated: Date.now() })

      const highPayout = monitor.getHighPayoutAssets()
      expect(highPayout).toHaveLength(1)
      expect(highPayout[0].name).toBe('BTC OTC')
    })

    it('onlyOTC가 false이면 모든 자산을 포함한다', () => {
      const monitorAll = new PayoutMonitor({ minPayout: 92, onlyOTC: false })
      const assets = (monitorAll as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })
      assets.set('EURUSD', { name: 'EURUSD', payout: 95, isOTC: false, lastUpdated: Date.now() })

      const highPayout = monitorAll.getHighPayoutAssets()
      expect(highPayout).toHaveLength(2)
    })

    it('threshold 미만인 자산은 모두 제외한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('LOW1 OTC', { name: 'LOW1 OTC', payout: 80, isOTC: true, lastUpdated: Date.now() })
      assets.set('LOW2 OTC', { name: 'LOW2 OTC', payout: 91, isOTC: true, lastUpdated: Date.now() })

      const highPayout = monitor.getHighPayoutAssets()
      expect(highPayout).toHaveLength(0)
    })

    it('threshold 정확히 일치하는 자산도 포함한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('EXACT OTC', { name: 'EXACT OTC', payout: 92, isOTC: true, lastUpdated: Date.now() })

      const highPayout = monitor.getHighPayoutAssets()
      expect(highPayout).toHaveLength(1)
    })
  })

  // ============================================================
  // getBestAsset
  // ============================================================

  describe('getBestAsset', () => {
    it('가장 높은 payout의 자산을 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('A OTC', { name: 'A OTC', payout: 92, isOTC: true, lastUpdated: Date.now() })
      assets.set('B OTC', { name: 'B OTC', payout: 96, isOTC: true, lastUpdated: Date.now() })
      assets.set('C OTC', { name: 'C OTC', payout: 94, isOTC: true, lastUpdated: Date.now() })

      const best = monitor.getBestAsset()
      expect(best).not.toBeNull()
      expect(best!.payout).toBe(96)
      expect(best!.name).toBe('B OTC')
    })

    it('조건에 맞는 자산이 없으면 null을 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('LOW OTC', { name: 'LOW OTC', payout: 80, isOTC: true, lastUpdated: Date.now() })

      const best = monitor.getBestAsset()
      expect(best).toBeNull()
    })

    it('자산이 없으면 null을 반환한다', () => {
      const best = monitor.getBestAsset()
      expect(best).toBeNull()
    })
  })

  // ============================================================
  // getAllAssets
  // ============================================================

  describe('getAllAssets', () => {
    it('모든 자산을 반환한다 (필터 없이)', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('A', { name: 'A', payout: 80, isOTC: false, lastUpdated: Date.now() })
      assets.set('B OTC', { name: 'B OTC', payout: 96, isOTC: true, lastUpdated: Date.now() })

      const all = monitor.getAllAssets()
      expect(all).toHaveLength(2)
    })

    it('빈 상태에서 빈 배열을 반환한다', () => {
      const all = monitor.getAllAssets()
      expect(all).toEqual([])
    })
  })

  // ============================================================
  // 자산 쿨다운 (isAssetInCooldown)
  // ============================================================

  describe('isAssetInCooldown', () => {
    it('등록되지 않은 자산은 쿨다운 상태가 아니다', () => {
      expect(monitor.isAssetInCooldown('UNKNOWN OTC')).toBe(false)
    })

    it('retry 횟수가 MAX_RETRY_COUNT 미만이면 쿨다운 상태가 아니다', () => {
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('BTC OTC', { name: 'BTC OTC', failedAt: Date.now(), retryCount: 2 }) // MAX=3, 아직 미달

      expect(monitor.isAssetInCooldown('BTC OTC')).toBe(false)
    })

    it('retry 횟수가 MAX_RETRY_COUNT 이상이고 쿨다운 시간 내이면 true', () => {
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('BTC OTC', { name: 'BTC OTC', failedAt: Date.now(), retryCount: 3 })

      expect(monitor.isAssetInCooldown('BTC OTC')).toBe(true)
    })

    it('쿨다운 시간이 지나면 자동으로 해제되고 false 반환', () => {
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      // 5분 전에 실패 → 쿨다운 만료
      const expired = Date.now() - (5 * 60 * 1000 + 1000) // 5분 + 1초 전
      unavailable.set('BTC OTC', { name: 'BTC OTC', failedAt: expired, retryCount: 3 })

      expect(monitor.isAssetInCooldown('BTC OTC')).toBe(false)
      // 쿨다운 해제 후 unavailableAssets에서도 삭제됨
      expect(unavailable.has('BTC OTC')).toBe(false)
    })

    it('retry 횟수 미달 + 쿨다운 시간 미만이면 false', () => {
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('ETH OTC', { name: 'ETH OTC', failedAt: Date.now(), retryCount: 1 })

      expect(monitor.isAssetInCooldown('ETH OTC')).toBe(false)
    })
  })

  // ============================================================
  // getAvailableAssets (쿨다운 제외 필터)
  // ============================================================

  describe('getAvailableAssets', () => {
    it('쿨다운 상태인 자산을 제외하고 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })
      assets.set('ETH OTC', { name: 'ETH OTC', payout: 93, isOTC: true, lastUpdated: Date.now() })

      // BTC OTC를 쿨다운 상태로 설정
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('BTC OTC', { name: 'BTC OTC', failedAt: Date.now(), retryCount: 3 })

      const available = monitor.getAvailableAssets()
      expect(available).toHaveLength(1)
      expect(available[0].name).toBe('ETH OTC')
    })

    it('모든 자산이 쿨다운이면 빈 배열을 반환한다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })

      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('BTC OTC', { name: 'BTC OTC', failedAt: Date.now(), retryCount: 3 })

      const available = monitor.getAvailableAssets()
      expect(available).toHaveLength(0)
    })

    it('쿨다운 자산이 없으면 getHighPayoutAssets와 동일하다', () => {
      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })
      assets.set('ETH OTC', { name: 'ETH OTC', payout: 93, isOTC: true, lastUpdated: Date.now() })

      const available = monitor.getAvailableAssets()
      const highPayout = monitor.getHighPayoutAssets()
      expect(available).toEqual(highPayout)
    })
  })

  // ============================================================
  // markAssetUnavailable (private 메서드)
  // ============================================================

  describe('markAssetUnavailable', () => {
    it('처음 실패 시 retryCount 1로 등록된다', () => {
      ;(monitor as any).markAssetUnavailable('BTC OTC')

      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      const entry = unavailable.get('BTC OTC')
      expect(entry).toBeDefined()
      expect(entry.retryCount).toBe(1)
      expect(entry.name).toBe('BTC OTC')
    })

    it('반복 실패 시 retryCount가 증가한다', () => {
      ;(monitor as any).markAssetUnavailable('BTC OTC')
      ;(monitor as any).markAssetUnavailable('BTC OTC')
      ;(monitor as any).markAssetUnavailable('BTC OTC')

      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      const entry = unavailable.get('BTC OTC')
      expect(entry.retryCount).toBe(3)
    })

    it('반복 실패 시 failedAt도 갱신된다', () => {
      const earlyTime = Date.now() - 10000
      const unavailable = (monitor as any).unavailableAssets as Map<string, any>
      unavailable.set('ETH OTC', { name: 'ETH OTC', failedAt: earlyTime, retryCount: 1 })

      ;(monitor as any).markAssetUnavailable('ETH OTC')

      const entry = unavailable.get('ETH OTC')
      expect(entry.retryCount).toBe(2)
      expect(entry.failedAt).toBeGreaterThan(earlyTime)
    })
  })

  // ============================================================
  // 구독(subscribe)
  // ============================================================

  describe('subscribe', () => {
    it('콜백을 등록하고 해제할 수 있다', () => {
      const callback = vi.fn()
      const unsubscribe = monitor.subscribe(callback)

      expect((monitor as any).observers).toHaveLength(1)

      unsubscribe()
      expect((monitor as any).observers).toHaveLength(0)
    })

    it('notifyObservers가 구독자에게 highPayoutAssets를 전달한다', () => {
      const callback = vi.fn()
      monitor.subscribe(callback)

      const assets = (monitor as any).assets as Map<string, AssetPayout>
      assets.set('BTC OTC', { name: 'BTC OTC', payout: 95, isOTC: true, lastUpdated: Date.now() })

      ;(monitor as any).notifyObservers()

      expect(callback).toHaveBeenCalledTimes(1)
      const passedAssets = callback.mock.calls[0][0]
      expect(passedAssets).toHaveLength(1)
      expect(passedAssets[0].name).toBe('BTC OTC')
    })
  })

  // ============================================================
  // isMonitoring 상태
  // ============================================================

  describe('isMonitoring', () => {
    it('초기 상태는 false이다', () => {
      expect(monitor.isMonitoring).toBe(false)
    })

    it('stop 호출 후 false가 된다', () => {
      ;(monitor as any)._isMonitoring = true
      monitor.stop()
      expect(monitor.isMonitoring).toBe(false)
    })
  })

  // ============================================================
  // parsePayoutPercent (private 메서드)
  // ============================================================

  describe('parsePayoutPercent', () => {
    it('+92% 형식을 올바르게 파싱한다', () => {
      const result = (monitor as any).parsePayoutPercent('+92%')
      expect(result).toBe(92)
    })

    it('92% 형식 (+부호 없이)을 올바르게 파싱한다', () => {
      const result = (monitor as any).parsePayoutPercent('92%')
      expect(result).toBe(92)
    })

    it('92 형식 (%기호 없이)을 올바르게 파싱한다', () => {
      const result = (monitor as any).parsePayoutPercent('92')
      expect(result).toBe(92)
    })

    it('잘못된 형식이면 0을 반환한다', () => {
      const result = (monitor as any).parsePayoutPercent('N/A')
      expect(result).toBe(0)
    })

    it('빈 문자열이면 0을 반환한다', () => {
      const result = (monitor as any).parsePayoutPercent('')
      expect(result).toBe(0)
    })
  })

  // ============================================================
  // stop 메서드
  // ============================================================

  describe('stop', () => {
    it('pollInterval을 정리한다', () => {
      ;(monitor as any).pollInterval = setInterval(() => {}, 10000)
      ;(monitor as any)._isMonitoring = true

      monitor.stop()

      expect((monitor as any).pollInterval).toBeNull()
      expect(monitor.isMonitoring).toBe(false)
    })

    it('pollInterval이 없을 때도 안전하게 동작한다', () => {
      ;(monitor as any).pollInterval = null
      monitor.stop()
      expect((monitor as any).pollInterval).toBeNull()
    })
  })

  // ============================================================
  // 기본 필터 설정
  // ============================================================

  describe('기본 필터', () => {
    it('인자 없이 생성하면 기본 필터가 적용된다', () => {
      const defaultMonitor = new PayoutMonitor()
      const filter = (defaultMonitor as any).filter as PayoutFilter
      expect(filter.minPayout).toBe(92)
      expect(filter.onlyOTC).toBe(true)
    })
  })
})

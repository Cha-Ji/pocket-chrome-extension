import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PocketOptionSafetyGuard } from './safety'

// Mock chrome API (safety doesn't use it, but other imports might)
const mockChrome = {
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
}
// @ts-ignore
globalThis.chrome = mockChrome

function setupDemoMode() {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/demo-quick-high-low/' },
    writable: true,
  })

  const label = document.createElement('div')
  label.className = 'balance-info-block__label'
  label.textContent = 'QT Demo'
  document.body.appendChild(label)

  const chartDemo = document.createElement('div')
  chartDemo.className = 'is-chart-demo'
  document.body.appendChild(chartDemo)
}

function setupLiveMode() {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/ko/cabinet/quick-high-low/' },
    writable: true,
  })

  const label = document.createElement('div')
  label.className = 'balance-info-block__label'
  label.textContent = 'Real Account'
  document.body.appendChild(label)
}

describe('PocketOptionSafetyGuard', () => {
  let guard: PocketOptionSafetyGuard

  beforeEach(() => {
    document.body.innerHTML = ''
    guard = new PocketOptionSafetyGuard()
  })

  afterEach(() => {
    guard.stopWatching()
    document.body.innerHTML = ''
  })

  describe('isDemoMode', () => {
    it('should return true for demo mode', () => {
      setupDemoMode()
      expect(guard.isDemoMode()).toBe(true)
    })

    it('should return false for live mode', () => {
      setupLiveMode()
      expect(guard.isDemoMode()).toBe(false)
    })
  })

  describe('getAccountType', () => {
    it('should return DEMO with high confidence when all signals match', () => {
      setupDemoMode()
      const result = guard.getAccountType()
      expect(result.type).toBe('DEMO')
      expect(result.confidence).toBe('high')
    })

    it('should return LIVE with medium confidence for live URL', () => {
      setupLiveMode()
      const result = guard.getAccountType()
      expect(result.type).toBe('LIVE')
      expect(result.confidence).toBe('medium')
    })

    it('should return DEMO with medium confidence when only URL has demo', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/demo/' },
        writable: true,
      })
      const result = guard.getAccountType()
      expect(result.type).toBe('DEMO')
      expect(result.confidence).toBe('medium')
    })
  })

  describe('canExecuteTrade', () => {
    it('should allow trading in demo mode', () => {
      setupDemoMode()
      const result = guard.canExecuteTrade(10)
      expect(result.allowed).toBe(true)
    })

    it('should block trading in live mode', () => {
      setupLiveMode()
      const result = guard.canExecuteTrade(10)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Demo mode required')
    })

    it('should block zero amount', () => {
      setupDemoMode()
      const result = guard.canExecuteTrade(0)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('positive')
    })

    it('should block negative amount', () => {
      setupDemoMode()
      const result = guard.canExecuteTrade(-5)
      expect(result.allowed).toBe(false)
    })
  })

  describe('onAccountTypeChange', () => {
    it('should notify when account type changes', async () => {
      setupDemoMode()
      const callback = vi.fn()
      guard.onAccountTypeChange(callback)
      guard.startWatching(50)

      // 리얼로 전환
      await new Promise((r) => setTimeout(r, 20))
      document.body.innerHTML = ''
      setupLiveMode()

      await new Promise((r) => setTimeout(r, 100))
      expect(callback).toHaveBeenCalledWith('LIVE')
    })

    it('should support unsubscribe', () => {
      setupDemoMode()
      const callback = vi.fn()
      const unsub = guard.onAccountTypeChange(callback)
      unsub()

      guard.startWatching(50)
      // 변경이 발생해도 콜백 호출 안 됨
      expect(callback).not.toHaveBeenCalled()
    })
  })
})

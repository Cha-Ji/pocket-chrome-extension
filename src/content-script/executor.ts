// ============================================================
// Trade Executor - Executes trades via DOM interaction
// ============================================================
// ⚠️ SAFETY CRITICAL: Always verify demo mode before trading!
// Real money protection is the #1 priority.
// ============================================================

import { DOMSelectors, Direction, isDemoMode, getAccountType, AccountType } from '../lib/types'
import { getSelectorResolver } from './selector-resolver'

export class TradeExecutor {
  private selectors: DOMSelectors
  private _isTrading = false
  private tradingLoop: ReturnType<typeof setInterval> | null = null
  private _allowLiveTrading = false // MUST be explicitly enabled
  private resolver = getSelectorResolver()

  constructor(selectors: DOMSelectors) {
    this.selectors = selectors
  }

  get isTrading(): boolean {
    return this._isTrading
  }

  /**
   * Check if we're in demo mode (safe to trade)
   */
  isInDemoMode(): boolean {
    return isDemoMode()
  }

  /**
   * Get detailed account type info
   */
  getAccountInfo(): { type: AccountType; confidence: 'high' | 'medium' | 'low' } {
    return getAccountType()
  }

  /**
   * Explicitly allow live trading (requires user confirmation)
   * ⚠️ USE WITH EXTREME CAUTION
   */
  enableLiveTrading(confirmed: boolean): void {
    if (confirmed) {
      console.warn('[TradeExecutor] ⚠️ LIVE TRADING ENABLED - Real money at risk!')
      this._allowLiveTrading = true
    }
  }

  /**
   * Disable live trading (return to safe mode)
   */
  disableLiveTrading(): void {
    this._allowLiveTrading = false
    console.log('[TradeExecutor] Live trading disabled - Demo only mode')
  }

  /**
   * Start auto-trading loop
   * SAFETY: Blocks if not in demo mode (unless explicitly allowed)
   */
  startAutoTrading(): { success: boolean; message: string } {
    if (this._isTrading) {
      return { success: false, message: 'Already trading' }
    }

    // ⚠️ CRITICAL SAFETY CHECK
    const accountInfo = this.getAccountInfo()
    
    if (accountInfo.type !== 'DEMO') {
      if (!this._allowLiveTrading) {
        const msg = `🚫 BLOCKED: Cannot start auto-trading on ${accountInfo.type} account. ` +
                    `Demo mode required for safety. ` +
                    `(Confidence: ${accountInfo.confidence})`
        console.error('[TradeExecutor]', msg)
        return { success: false, message: msg }
      } else {
        console.warn('[TradeExecutor] ⚠️ Starting auto-trading on LIVE account!')
      }
    }

    console.log('[TradeExecutor] Starting auto-trading (Demo mode verified)...')
    this._isTrading = true

    return { success: true, message: 'Auto-trading started (Demo mode)' }
  }

  /**
   * Stop auto-trading loop
   */
  stopAutoTrading(): { success: boolean; message: string } {
    if (!this._isTrading) {
      return { success: false, message: 'Not trading' }
    }

    console.log('[TradeExecutor] Stopping auto-trading...')
    
    if (this.tradingLoop) {
      clearInterval(this.tradingLoop)
      this.tradingLoop = null
    }
    
    this._isTrading = false

    return { success: true, message: 'Auto-trading stopped' }
  }

  /**
   * Execute a single trade
   * SAFETY: Blocks if not in demo mode (unless explicitly allowed)
   */
  async executeTrade(direction: Direction, amount?: number): Promise<{ success: boolean; error?: string }> {
    console.log(`[TradeExecutor] Executing ${direction} trade...`)

    try {
      // ⚠️ CRITICAL SAFETY CHECK - Must be first!
      const accountInfo = this.getAccountInfo()
      
      if (accountInfo.type !== 'DEMO' && !this._allowLiveTrading) {
        const error = `🚫 BLOCKED: Cannot execute trade on ${accountInfo.type} account. Demo mode required.`
        console.error('[TradeExecutor]', error)
        return { success: false, error }
      }

      if (accountInfo.type !== 'DEMO' && this._allowLiveTrading) {
        console.warn(`[TradeExecutor] ⚠️ Executing ${direction} trade on LIVE account!`)
      }

      // Validate we can trade
      const validation = await this.validateTradeConditions()
      if (!validation.canTrade) {
        return { success: false, error: validation.reason }
      }

      // Click the appropriate button
      const button = await this.getTradeButton(direction)
      if (!button) {
        return { success: false, error: `${direction} button not found` }
      }

      // TODO: Set amount if specified
      if (amount) {
        await this.setTradeAmount(amount)
      }

      // Execute click
      this.simulateClick(button)

      // Notify background
      chrome.runtime.sendMessage({
        type: 'TRADE_EXECUTED',
        payload: { direction, amount, timestamp: Date.now() },
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  // ============================================================
  // STUB: DOM Interaction Methods
  // These methods need actual implementation after login
  // ============================================================

  /**
   * Get trade button element using robust resolution
   */
  private async getTradeButton(direction: Direction): Promise<HTMLElement | null> {
    const key = direction === 'CALL' ? 'callButton' : 'putButton'
    return await this.resolver.resolve(key)
  }

  /**
   * Validate trade conditions
   */
  private async validateTradeConditions(): Promise<{ canTrade: boolean; reason?: string }> {
    // Check if buttons exist using resolver
    const callBtn = await this.resolver.resolve('callButton')
    const putBtn = await this.resolver.resolve('putButton')

    if (!callBtn || !putBtn) {
      return { canTrade: false, reason: 'Trade buttons not found (even with fallbacks)' }
    }

    return { canTrade: true }
  }

  /**
   * Set trade amount
   */
  private async setTradeAmount(amount: number): Promise<void> {
    const amountInput = document.querySelector(this.selectors.amountInput) as HTMLInputElement
    if (!amountInput) {
      console.warn('[TradeExecutor] Amount input not found')
      return
    }

    // Clear and set new value
    amountInput.value = amount.toString()
    
    // Trigger input event for React/Vue reactivity
    amountInput.dispatchEvent(new Event('input', { bubbles: true }))
    amountInput.dispatchEvent(new Event('change', { bubbles: true }))
    
    console.log(`[TradeExecutor] Amount set to ${amount}`)
  }

  /**
   * Simulate click on element
   */
  private simulateClick(element: Element): void {
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    element.dispatchEvent(event)
  }

  /**
   * Get current balance from DOM using robust resolution
   */
  async getCurrentBalance(): Promise<number | null> {
    const balanceElement = await this.resolver.resolve('balanceDisplay')
    if (!balanceElement) return null

    const text = balanceElement.textContent?.trim() || ''
    const cleaned = text.replace(/[^0-9.]/g, '')
    const balance = parseFloat(cleaned)
    
    return isNaN(balance) ? null : balance
  }
}

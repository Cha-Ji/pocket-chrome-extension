
// ============================================================
// Telegram Notification Service
// ============================================================

export interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
  notifySignals: boolean
  notifyTrades: boolean
  notifyErrors: boolean
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  enabled: false,
  notifySignals: true,
  notifyTrades: true,
  notifyErrors: true,
}

/** Shape expected by notifySignal (accepts both Signal and legacy shapes) */
export interface SignalNotification {
  direction: string
  ticker?: string
  symbol?: string
  strategy: string
  price?: number
  entryPrice?: number
  timestamp: number
}

/** Shape expected by notifyTrade */
export interface TradeNotification {
  result: string
  ticker: string
  profit: number
  entryPrice: number
  exitPrice: number
}

export class TelegramService {
  private config: TelegramConfig

  constructor(config: TelegramConfig = DEFAULT_TELEGRAM_CONFIG) {
    this.config = config
  }

  updateConfig(newConfig: Partial<TelegramConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  getConfig(): TelegramConfig {
    return this.config
  }

  async sendMessage(text: string): Promise<boolean> {
    if (!this.config.enabled || !this.config.botToken || !this.config.chatId) {
      return false
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      })

      const data = await response.json()
      if (!data.ok) {
        console.error('[Telegram] API Error:', data.description)
        return false
      }
      return true
    } catch (error) {
      console.error('[Telegram] Network Error:', error)
      return false
    }
  }

  // ============================================================
  // Specific Notification Helpers
  // ============================================================

  async notifySignal(signal: SignalNotification): Promise<void> {
    if (!this.config.notifySignals) return

    const emoji = signal.direction === 'CALL' ? '🟢 <b>CALL (Buy)</b>' : '🔴 <b>PUT (Sell)</b>'
    const ticker = signal.ticker || signal.symbol || 'UNKNOWN'
    const price = signal.price ?? signal.entryPrice ?? 0
    const message = `
${emoji}
<b>Asset:</b> ${ticker}
<b>Strategy:</b> ${signal.strategy}
<b>Price:</b> ${price}
<b>Time:</b> ${new Date(signal.timestamp).toLocaleTimeString()}
    `.trim()

    await this.sendMessage(message)
  }

  async notifyTrade(trade: TradeNotification): Promise<void> {
    if (!this.config.notifyTrades) return

    const resultEmoji = trade.result === 'WIN' ? '💰 <b>WIN</b>' : '💸 <b>LOSS</b>'
    const message = `
${resultEmoji}
<b>Asset:</b> ${trade.ticker}
<b>Profit:</b> $${trade.profit}
<b>Entry:</b> ${trade.entryPrice}
<b>Exit:</b> ${trade.exitPrice}
    `.trim()

    await this.sendMessage(message)
  }

  async notifyError(error: string): Promise<void> {
    if (!this.config.notifyErrors) return
    await this.sendMessage(`⚠️ <b>System Error</b>\n${error}`)
  }

  /**
   * Send a system status update (useful for session starts)
   */
  async notifyStatus(status: string): Promise<void> {
    await this.sendMessage(`ℹ️ <b>System Status</b>\n${status}`)
  }
}

// Singleton for global use
let telegramInstance: TelegramService | null = null

export async function getTelegramService(): Promise<TelegramService> {
  if (!telegramInstance) {
    // 설정 로드: botToken은 session storage, 나머지는 local storage
    const [localResult, sessionResult] = await Promise.all([
      chrome.storage.local.get('appConfig'),
      chrome.storage.session.get('telegramSecure'),
    ])

    const appConfig = localResult.appConfig || {}
    const telegramLocal = appConfig.telegram || {}
    const secureData = sessionResult.telegramSecure || {}

    const config: TelegramConfig = {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...telegramLocal,
      // session storage에서 botToken 복원
      botToken: secureData.botToken || '',
    }

    telegramInstance = new TelegramService(config)
  }
  return telegramInstance
}

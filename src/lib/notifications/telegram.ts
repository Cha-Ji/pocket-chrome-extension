
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

  async notifySignal(signal: any): Promise<void> {
    if (!this.config.notifySignals) return

    const emoji = signal.direction === 'CALL' ? '🟢 <b>CALL (Buy)</b>' : '🔴 <b>PUT (Sell)</b>'
    const message = `
${emoji}
<b>Asset:</b> ${signal.ticker}
<b>Strategy:</b> ${signal.strategy}
<b>Price:</b> ${signal.price}
<b>Time:</b> ${new Date(signal.timestamp).toLocaleTimeString()}
    `.trim()

    await this.sendMessage(message)
  }

  async notifyTrade(trade: any): Promise<void> {
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
    // Load config from storage
    const stored = await chrome.storage.local.get('telegramConfig')
    const config = stored.telegramConfig || DEFAULT_TELEGRAM_CONFIG
    telegramInstance = new TelegramService(config)
  }
  return telegramInstance
}

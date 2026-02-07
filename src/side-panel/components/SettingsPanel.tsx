
import { useState, useEffect } from 'react'
import { TelegramConfig, DEFAULT_TELEGRAM_CONFIG, TelegramService } from '../../lib/notifications/telegram'
import { loadTelegramConfig, saveTelegramConfig } from '../../lib/config'

export function SettingsPanel() {
  const [config, setConfig] = useState<TelegramConfig>(DEFAULT_TELEGRAM_CONFIG)
  const [testStatus, setTestStatus] = useState<string>('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    // 통합 config에서 텔레그램 설정 로드 (botToken은 session storage에서)
    const telegramConfig = await loadTelegramConfig()
    setConfig(telegramConfig)
  }

  const saveConfig = async (newConfig: TelegramConfig) => {
    setConfig(newConfig)
    // botToken은 session storage, 나머지는 local storage에 자동 분리 저장
    await saveTelegramConfig(newConfig)

    // Notify background/content scripts to reload config
    chrome.runtime.sendMessage({ type: 'RELOAD_TELEGRAM_CONFIG', payload: newConfig })
  }

  const handleChange = (key: keyof TelegramConfig, value: any) => {
    saveConfig({ ...config, [key]: value })
  }

  const handleTest = async () => {
    setTestStatus('Sending...')
    const service = new TelegramService(config)
    const success = await service.sendMessage('🔔 <b>Test Notification</b>\nPocket Quant connected successfully!')
    setTestStatus(success ? '✅ Success' : '❌ Failed')
    setTimeout(() => setTestStatus(''), 3000)
  }

  return (
    <div className="space-y-4 p-2">
      <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between">
          Telegram Notification
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-pocket-blue focus:ring-pocket-blue bg-gray-700"
            />
          </div>
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bot Token</label>
            <input
              type="password"
              value={config.botToken}
              onChange={(e) => handleChange('botToken', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-pocket-blue"
              placeholder="123456:ABC-DEF1234..."
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Chat ID</label>
            <input
              type="text"
              value={config.chatId}
              onChange={(e) => handleChange('chatId', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-pocket-blue"
              placeholder="-100123456789"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="flex items-center space-x-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={config.notifySignals}
                onChange={(e) => handleChange('notifySignals', e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              <span>Signals</span>
            </label>
            <label className="flex items-center space-x-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={config.notifyTrades}
                onChange={(e) => handleChange('notifyTrades', e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              <span>Trades</span>
            </label>
          </div>

          <button
            onClick={handleTest}
            disabled={!config.botToken || !config.chatId}
            className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
              !config.botToken || !config.chatId
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-pocket-blue text-white hover:bg-blue-600'
            }`}
          >
            {testStatus || 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="text-[10px] text-gray-600 px-2">
        <p>1. Create bot via @BotFather</p>
        <p>2. Get Token</p>
        <p>3. Start chat with bot</p>
        <p>4. Get Chat ID via @userinfobot</p>
      </div>
    </div>
  )
}

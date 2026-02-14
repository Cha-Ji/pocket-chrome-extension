// ============================================================
// AppConfig - 통합 설정 관리
// ============================================================
// 분산된 4개 Config를 하나의 AppConfig로 통합
// chrome.storage.local 기반 영속 저장 (텔레그램 토큰은 session)
// ============================================================

import { TelegramConfig, DEFAULT_TELEGRAM_CONFIG } from '../notifications/telegram'
import { AutoTraderConfig } from '../trading/auto-trader'
import { BacktestConfig } from '../backtest/types'
import type { TradingConfigV2 } from '../types'

// 통합 AppConfig 인터페이스
export interface AppConfig {
  trading: TradingConfigV2
  autoTrader: Partial<AutoTraderConfig>
  telegram: TelegramConfig
  backtest: Partial<BacktestConfig>
}

// 기본값 상수
export const DEFAULT_TRADING_CONFIG: TradingConfigV2 = {
  enabled: false,
  autoAssetSwitch: true,
  minPayout: 92,
  tradeAmount: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  onlyRSI: true,
}

export const DEFAULT_AUTO_TRADER_CONFIG: Partial<AutoTraderConfig> = {
  enabled: false,
  symbol: 'BTCUSDT',
  initialBalance: 1000,
  riskPerTrade: 1,
  fixedAmount: 10,
  usePercentage: true,
  minAmount: 1,
  maxAmount: 100,
  expiry: 60,
  cooldownMs: 30000,
  maxDailyTrades: 20,
  maxDailyLoss: 100,
  maxDailyLossPercent: 10,
  maxDrawdown: 20,
  maxConsecutiveLosses: 5,
  demoMode: true,
}

export const DEFAULT_BACKTEST_CONFIG: Partial<BacktestConfig> = {
  symbol: 'BTCUSDT',
  initialBalance: 1000,
  betAmount: 10,
  betType: 'fixed',
  payout: 92,
  expirySeconds: 60,
  strategyId: 'rsi-v2',
}

export const DEFAULT_CONFIG: AppConfig = {
  trading: DEFAULT_TRADING_CONFIG,
  autoTrader: DEFAULT_AUTO_TRADER_CONFIG,
  telegram: DEFAULT_TELEGRAM_CONFIG,
  backtest: DEFAULT_BACKTEST_CONFIG,
}

// ============================================================
// 런타임 스키마 검증
// ============================================================

function isNumber(v: unknown, positive = false): v is number {
  return typeof v === 'number' && !Number.isNaN(v) && (!positive || v > 0)
}

/**
 * TradingConfigV2 런타임 검증
 * 누락/오염된 필드는 기본값으로 폴백하고 경고 로그를 남긴다.
 */
export function validateTradingConfig(raw: unknown): TradingConfigV2 {
  if (typeof raw !== 'object' || raw === null) {
    console.warn('[Config] Trading config is not an object, falling back to defaults')
    return { ...DEFAULT_TRADING_CONFIG }
  }

  const obj = raw as Record<string, unknown>
  const fallbacks: string[] = []

  function fallback<T>(key: string, validator: (v: unknown) => v is T, defaultVal: T): T {
    if (validator(obj[key])) return obj[key] as T
    fallbacks.push(key)
    return defaultVal
  }

  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  const isPositiveNum = (v: unknown): v is number => isNumber(v, true)
  const isPositiveInt = (v: unknown): v is number => isNumber(v, true) && Number.isInteger(v)

  const result: TradingConfigV2 = {
    enabled: fallback('enabled', isBool, DEFAULT_TRADING_CONFIG.enabled),
    autoAssetSwitch: fallback('autoAssetSwitch', isBool, DEFAULT_TRADING_CONFIG.autoAssetSwitch),
    minPayout: fallback('minPayout', isPositiveNum, DEFAULT_TRADING_CONFIG.minPayout),
    tradeAmount: fallback('tradeAmount', isPositiveNum, DEFAULT_TRADING_CONFIG.tradeAmount),
    maxDrawdown: fallback('maxDrawdown', isPositiveNum, DEFAULT_TRADING_CONFIG.maxDrawdown),
    maxConsecutiveLosses: fallback('maxConsecutiveLosses', isPositiveInt, DEFAULT_TRADING_CONFIG.maxConsecutiveLosses),
    onlyRSI: fallback('onlyRSI', isBool, DEFAULT_TRADING_CONFIG.onlyRSI),
  }

  if (fallbacks.length > 0) {
    console.warn(`[Config] Trading config fields fell back to defaults: ${fallbacks.join(', ')}`)
  }

  return result
}

// ============================================================
// Storage Key 상수
// ============================================================

const STORAGE_KEY = 'appConfig'
// 텔레그램 봇 토큰은 session storage에 별도 저장 (보안)
const TELEGRAM_SECURE_KEY = 'telegramSecure'

// ============================================================
// Load / Save 함수
// ============================================================

/**
 * AppConfig 로드
 * - 일반 설정: chrome.storage.local
 * - 텔레그램 botToken: chrome.storage.session (보안)
 */
export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const [localResult, sessionResult] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEY),
      chrome.storage.session.get(TELEGRAM_SECURE_KEY),
    ])

    const stored: Partial<AppConfig> = localResult[STORAGE_KEY] || {}
    const secureData = sessionResult[TELEGRAM_SECURE_KEY] || {}

    const config: AppConfig = {
      trading: validateTradingConfig(stored.trading ?? {}),
      autoTrader: { ...DEFAULT_CONFIG.autoTrader, ...stored.autoTrader },
      telegram: {
        ...DEFAULT_CONFIG.telegram,
        ...stored.telegram,
        // session storage에서 botToken 복원
        botToken: secureData.botToken || stored.telegram?.botToken || '',
      },
      backtest: { ...DEFAULT_CONFIG.backtest, ...stored.backtest },
    }

    return config
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * AppConfig 저장
 * - botToken은 chrome.storage.session에 분리 저장
 * - local에는 botToken을 빈 문자열로 마스킹
 */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  // botToken을 session storage에 분리 저장
  const botToken = config.telegram.botToken

  // local storage에는 botToken 제거 (마스킹)
  const localConfig: AppConfig = {
    ...config,
    telegram: {
      ...config.telegram,
      botToken: '', // local에는 저장하지 않음
    },
  }

  await Promise.all([
    chrome.storage.local.set({ [STORAGE_KEY]: localConfig }),
    chrome.storage.session.set({ [TELEGRAM_SECURE_KEY]: { botToken } }),
  ])
}

/**
 * 특정 섹션만 업데이트
 */
export async function updateConfigSection<K extends keyof AppConfig>(
  section: K,
  updates: Partial<AppConfig[K]>,
): Promise<AppConfig> {
  const current = await loadAppConfig()
  const updated: AppConfig = {
    ...current,
    [section]: { ...current[section], ...updates },
  }
  await saveAppConfig(updated)
  return updated
}

// ============================================================
// 텔레그램 보안 전용 함수
// ============================================================

/**
 * 텔레그램 설정 로드 (botToken 포함)
 * session storage에서 토큰을 가져옴
 */
export async function loadTelegramConfig(): Promise<TelegramConfig> {
  const config = await loadAppConfig()
  return config.telegram
}

/**
 * 텔레그램 설정 저장
 * botToken은 자동으로 session storage로 분리
 */
export async function saveTelegramConfig(telegramConfig: TelegramConfig): Promise<void> {
  await updateConfigSection('telegram', telegramConfig)
}

// Re-export 타입들 (각 모듈의 원본 타입은 유지)
export type { TradingConfigV2 } from '../types'
export type { TelegramConfig } from '../notifications/telegram'
export type { AutoTraderConfig } from '../trading/auto-trader'
export type { BacktestConfig } from '../backtest/types'

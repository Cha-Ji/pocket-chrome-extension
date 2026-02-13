import { useState, useEffect, useCallback } from 'react'
import { Signal } from '../../lib/signals/types'
import { AssetPayout, MessageType } from '../../lib/types'
import { sendTabMessage } from '../infrastructure/extension-client'
import { usePortSubscription } from './usePortSubscription'

export interface SystemStatus {
  initialized: boolean
  modules: {
    dataCollector: boolean
    candleCollector: boolean
    payoutMonitor: boolean
  }
  config: {
    enabled: boolean
    autoAssetSwitch: boolean
    minPayout: number
    tradeAmount: number
    onlyRSI: boolean
  }
  signals: {
    total: number
    wins: number
    losses: number
    pending: number
    winRate: number
  } | null
  highPayoutAssets: number
  candleCount: Array<{ ticker: string; count: number }>
}

export function useSignalStatus(onSignal?: (signal: Signal) => void) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [highPayoutAssets, setHighPayoutAssets] = useState<AssetPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Send message to content script (type-safe)
  const sendMessage = useCallback(async (type: MessageType, payload?: unknown) => {
    return sendTabMessage(type, payload)
  }, [])

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await sendMessage('GET_STATUS_V2') as SystemStatus
      setStatus(result)

      const signalList = await sendMessage('GET_SIGNALS', { limit: 20 }) as Signal[]
      setSignals(signalList || [])

      const assets = await sendMessage('GET_HIGH_PAYOUT_ASSETS') as AssetPayout[]
      setHighPayoutAssets(assets || [])
    } catch {
      setError('확장 프로그램 연결 실패. 페이지를 새로고침하거나 Pocket Option 탭을 활성화하세요.')
    }
    setIsLoading(false)
  }, [sendMessage])

  const toggleTrading = useCallback(async () => {
    try {
      const type = status?.config.enabled ? 'STOP_TRADING_V2' : 'START_TRADING_V2'
      await sendMessage(type)
      await fetchStatus()
    } catch {
      setError('Failed to toggle trading')
    }
  }, [status?.config.enabled, fetchStatus, sendMessage])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev)
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Subscribe to new signals via port (replaces onMessage listener + autoRefresh polling)
  const handleNewSignal = useCallback((payload: unknown) => {
    if (payload) {
      const { signal } = payload as { signal: Signal }
      setSignals(prev => [signal, ...prev].slice(0, 20))
      onSignal?.(signal)
    }
  }, [onSignal])
  usePortSubscription('NEW_SIGNAL_V2', handleNewSignal)

  // Subscribe to payout updates via port
  const handlePayoutUpdate = useCallback((payload: unknown) => {
    if (payload) {
      const { name, payout } = payload as { name: string; payout: number }
      setHighPayoutAssets(prev => {
        const exists = prev.some(a => a.name === name)
        if (exists) return prev.map(a => a.name === name ? { ...a, payout } : a)
        return [...prev, { name, payout, isOTC: name.includes('OTC'), lastUpdated: Date.now() }].slice(0, 10)
      })
    }
  }, [])
  usePortSubscription('BEST_ASSET', handlePayoutUpdate)

  // Fallback: auto refresh for full status sync (optional, off by default)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchStatus, 10000) // Reduced from 5s to 10s
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStatus])

  return {
    status,
    signals,
    highPayoutAssets,
    isLoading,
    autoRefresh,
    error,
    fetchStatus,
    toggleTrading,
    toggleAutoRefresh,
  }
}

import { useState, useEffect, useCallback } from 'react'
import { Signal } from '../../lib/signals/types'
import { sendTabMessage, onRuntimeMessage } from '../infrastructure/extension-client'

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

export interface AssetPayout {
  name: string
  payout: number
  isOTC: boolean
}

export function useSignalStatus(onSignal?: (signal: Signal) => void) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [highPayoutAssets, setHighPayoutAssets] = useState<AssetPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await sendTabMessage('GET_STATUS_V2') as SystemStatus
      setStatus(result)

      const signalList = await sendTabMessage('GET_SIGNALS', { limit: 20 }) as Signal[]
      setSignals(signalList || [])

      const assets = await sendTabMessage('GET_HIGH_PAYOUT_ASSETS') as AssetPayout[]
      setHighPayoutAssets(assets || [])
    } catch {
      setError('확장 프로그램 연결 실패. 페이지를 새로고침하거나 Pocket Option 탭을 활성화하세요.')
    }
    setIsLoading(false)
  }, [])

  const toggleTrading = useCallback(async () => {
    try {
      const type = status?.config.enabled ? 'STOP_TRADING_V2' : 'START_TRADING_V2'
      await sendTabMessage(type)
      await fetchStatus()
    } catch {
      setError('Failed to toggle trading')
    }
  }, [status?.config.enabled, fetchStatus])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev)
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStatus])

  // Listen for new signals from content script
  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message.type === 'NEW_SIGNAL_V2' && message.payload) {
        const { signal } = message.payload as { signal: Signal }
        setSignals(prev => [signal, ...prev].slice(0, 20))
        onSignal?.(signal)
      }
    })
  }, [onSignal])

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

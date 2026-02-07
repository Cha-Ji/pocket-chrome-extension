import { useState, useEffect, useCallback } from 'react'
import { TradingStatus, ExtensionMessage } from '../../lib/types'
import { errorHandler, tryCatchAsync } from '../../lib/errors'

const initialStatus: TradingStatus = {
  isRunning: false,
  currentTicker: undefined,
  balance: undefined,
  sessionId: undefined,
}

export function useTradingStatus() {
  const [status, setStatus] = useState<TradingStatus>(initialStatus)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch initial status
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' })
      .then((response) => {
        if (response) {
          setStatus(response as TradingStatus)
        }
      })
      .catch((error) => {
        console.warn('[side-panel] Failed to load initial status:', error)
      })
  }, [])

  // Listen for status updates
  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'STATUS_UPDATE') {
        setStatus(message.payload as TradingStatus)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const startTrading = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'START_TRADING' })
      return response || { success: false, error: 'No response' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[side-panel] Start trading error:', error)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const stopTrading = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'STOP_TRADING' })
      return response || { success: false, error: 'No response' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[side-panel] Stop trading error:', error)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    status,
    isLoading,
    startTrading,
    stopTrading,
  }
}

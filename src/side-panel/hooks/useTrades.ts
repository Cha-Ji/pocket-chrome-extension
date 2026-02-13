
import { useState, useEffect, useCallback } from 'react'
import { Trade, ExtensionMessage } from '../../lib/types'

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTrades = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TRADES',
        payload: { limit: 50 },
      })
      if (Array.isArray(response)) {
        setTrades(response)
      }
    } catch {
      // Background may not be ready yet
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrades()

    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'TRADE_LOGGED' && message.payload) {
        const trade: Trade = message.payload
        setTrades(prev => {
          // Deduplicate by id
          if (trade.id !== undefined && prev.some(t => t.id === trade.id)) {
            return prev
          }
          return [...prev, trade]
        })
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [fetchTrades])

  return { trades, isLoading, refetch: fetchTrades }
}

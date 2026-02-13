
import { useState, useEffect, useCallback } from 'react'
import { Trade } from '../../lib/types'
import { sendRuntimeMessage, onRuntimeMessage } from '../infrastructure/extension-client'

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTrades = useCallback(async () => {
    try {
      const response = await sendRuntimeMessage('GET_TRADES', { limit: 50 })
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

    return onRuntimeMessage((message) => {
      if (message.type === 'TRADE_LOGGED' && message.payload) {
        const trade = message.payload as Trade
        setTrades(prev => {
          // Deduplicate by id
          if (trade.id !== undefined && prev.some(t => t.id === trade.id)) {
            return prev
          }
          return [...prev, trade]
        })
      }
    })
  }, [fetchTrades])

  return { trades, isLoading, refetch: fetchTrades }
}

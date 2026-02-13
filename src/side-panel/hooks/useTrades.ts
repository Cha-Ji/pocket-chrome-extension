
import { useState, useEffect } from 'react'
import { Trade } from '../../lib/types'
import { onRuntimeMessage } from '../infrastructure/extension-client'

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message.type === 'TRADE_EXECUTED' && message.payload) {
        // TRADE_EXECUTED payload is { signalId?, result?, timestamp? }
        // Map to Trade shape for display
        const trade = message.payload as Trade
        setTrades(prev => [...prev, trade])
      }
    })
  }, [])

  return { trades }
}

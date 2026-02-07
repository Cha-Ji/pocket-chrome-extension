
import { useState, useEffect } from 'react'
import { Trade, ExtensionMessage } from '../../lib/types'

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    // Initial fetch (if we had a GET_TRADES message)
    // For now we listen for new trades
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'TRADE_EXECUTED' && message.payload) {
        // TRADE_EXECUTED payload is { signalId?, result?, timestamp? }
        // Map to Trade shape for display
        const trade = message.payload as unknown as Trade
        setTrades(prev => [...prev, trade])
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  return { trades }
}

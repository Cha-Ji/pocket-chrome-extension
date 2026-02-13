
import { useState, useEffect } from 'react'
import { Trade, ExtensionMessage, MessagePayloadMap } from '../../lib/types'

/** Build a Trade from TRADE_EXECUTED payload, filling defaults for missing fields */
function payloadToTrade(payload: MessagePayloadMap['TRADE_EXECUTED']): Trade {
  return {
    sessionId: 0,
    ticker: payload.ticker ?? 'unknown',
    direction: payload.direction ?? 'CALL',
    entryTime: payload.timestamp,
    entryPrice: payload.entryPrice ?? 0,
    result: 'PENDING',
    amount: payload.amount ?? 0,
  }
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'TRADE_EXECUTED' && message.payload) {
        const trade = payloadToTrade(message.payload)
        setTrades(prev => [...prev, trade])
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  return { trades }
}

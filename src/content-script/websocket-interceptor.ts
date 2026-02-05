import { getWebSocketParser, WebSocketParser, CandleData } from './websocket-parser'

export interface WebSocketConnection {
  id: string
  url: string
  isPriceRelated: boolean
  readyState: 'connecting' | 'open' | 'closing' | 'closed'
  messageCount: number
  lastMessageAt: number | null
}

export interface WebSocketMessage {
  connectionId: string
  url: string
  parsed: any
  rawType: string
  timestamp: number
}

export interface PriceUpdate {
  symbol: string
  price: number
  timestamp: number
  source: 'websocket'
}

export type WebSocketEventType = 'installed' | 'connection' | 'open' | 'close' | 'error' | 'message'

export interface WebSocketEvent {
  type: WebSocketEventType
  data: any
  timestamp: number
}

type PriceUpdateCallback = (update: PriceUpdate) => void
type HistoryCallback = (candles: CandleData[]) => void
type MessageCallback = (message: WebSocketMessage) => void
type ConnectionCallback = (connection: WebSocketConnection) => void

class WebSocketInterceptor {
  private connections: Map<string, WebSocketConnection> = new Map()
  private messageBuffer: WebSocketMessage[] = []
  private maxBufferSize = 1000
  private isInstalled = false
  private isListening = false
  private analysisMode = true
  private parser: WebSocketParser
  private priceUpdateCallbacks: PriceUpdateCallback[] = []
  private historyCallbacks: HistoryCallback[] = []
  private messageCallbacks: MessageCallback[] = []
  private connectionCallbacks: ConnectionCallback[] = []

  private static instance: WebSocketInterceptor | null = null

  static getInstance(): WebSocketInterceptor {
    if (!WebSocketInterceptor.instance) WebSocketInterceptor.instance = new WebSocketInterceptor()
    return WebSocketInterceptor.instance
  }

  private constructor() {
    this.parser = getWebSocketParser()
  }

  start(): void {
    if (this.isListening) return
    console.log('[PO] [WS] Starting Interceptor...');
    this.setupEventListener()
    this.injectScript()
    this.isListening = true
  }

  stop(): void {
    if (!this.isListening) return
    window.removeEventListener('pocket-quant-ws', this.handleEvent as EventListener)
    this.isListening = false
  }

  private injectScript(): void {
    try {
      if (document.querySelector('script[data-pocket-quant-ws]')) return

      // Use script src method which is allowed by PO's CSP
      const script = document.createElement('script')
      script.src = chrome.runtime.getURL('inject-websocket.js')
      script.setAttribute('data-pocket-quant-ws', 'true')
      
      script.onload = () => {
        console.log('[PO] [WS] Spy Script Injected');
        script.remove()
      }
      
      const target = document.head || document.documentElement
      target.appendChild(script)
    } catch (error) {
      console.error('[PO] [WS] Injection failed:', error)
    }
  }

  private setupEventListener(): void {
    window.addEventListener('message', (event) => {
        if (event.data?.source !== 'pq-bridge') return;
        if (event.data.type === 'ws-message') {
            this.handleMessage(event.data.data, Date.now());
        } else if (event.data.type === 'bridge-ready') {
            console.log('[PO] [WS] Main World Bridge Connected');
        }
    });
  }

  private handleEvent = (event: CustomEvent<WebSocketEvent>): void => {
    const { type, data, timestamp } = event.detail
    if (type === 'message') this.handleMessage(data, timestamp)
  }

  private handleMessage(data: WebSocketMessage, timestamp: number): void {
    // [DEBUG] 모든 원본 메시지 로깅 (Raw Data Inspection)
    if (data.rawType === 'string' && data.parsed) {
        console.log('[PO] [WS-RAW] Payload:', JSON.stringify(data.parsed).substring(0, 500));
    } else {
        console.log('[PO] [WS-RAW] Non-JSON Data:', data.rawType);
    }

    this.messageCallbacks.forEach(cb => cb(data))

    if (data.parsed && data.parsed.type === 'candle_history' && Array.isArray(data.parsed.data)) {
        const candles = data.parsed.data as CandleData[]
        if (candles.length > 0) {
            console.log(`[PO] [WS] History Captured: ${candles.length} candles for ${candles[0].symbol}`)
            this.historyCallbacks.forEach(cb => cb(candles))
        }
    }

    const priceUpdate = this.parser.extractPrice(data.parsed)
    if (priceUpdate) {
      this.priceUpdateCallbacks.forEach(cb => cb({ ...priceUpdate, timestamp: priceUpdate.timestamp || timestamp }))
    }
  }

  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.priceUpdateCallbacks.push(callback)
    return () => { const i = this.priceUpdateCallbacks.indexOf(callback); if (i > -1) this.priceUpdateCallbacks.splice(i, 1) }
  }

  onHistoryReceived(callback: HistoryCallback): () => void {
    this.historyCallbacks.push(callback)
    return () => { const i = this.historyCallbacks.indexOf(callback); if (i > -1) this.historyCallbacks.splice(i, 1) }
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.push(callback)
    return () => { const i = this.messageCallbacks.indexOf(callback); if (i > -1) this.messageCallbacks.splice(i, 1) }
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback)
    return () => { const i = this.connectionCallbacks.indexOf(callback); if (i > -1) this.connectionCallbacks.splice(i, 1) }
  }

  getStatus() {
    return {
      isListening: this.isListening,
      analysisMode: this.analysisMode,
      messageCount: this.messageBuffer.length,
    }
  }
}

export function getWebSocketInterceptor(): WebSocketInterceptor {
  return WebSocketInterceptor.getInstance()
}

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
  raw?: any
  text?: string | null
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
  
  // [PO-17] 실시간 자산 코드 추적
  private lastAssetId: string | null = null;

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
    // console.log('[PO] [WS] Starting Interceptor...');
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
    // [PO-16] Tampermonkey 사용 시 Extension 자체 주입은 비활성화
    // Tampermonkey가 이미 'window.__pocketQuantWsHook'을 설정하므로 충돌 방지됨.
    // 하지만 안전을 위해 아예 주입 시도를 막아둡니다.
    // console.log('[PO] [WS] Skipping Extension Injection (Using Tampermonkey)');
    return;

    /*
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
    */
  }

  private setupEventListener(): void {
    window.addEventListener('message', (event) => {
      if (event.data?.source !== 'pq-bridge') return;
      if (event.data.type === 'ws-message') {
        const data = event.data.data || {};
        const message: WebSocketMessage = {
          connectionId: data.url || 'tm-bridge',
          url: data.url || 'unknown',
          parsed: data.payload ?? null,
          rawType: data.dataType || (data.text ? 'string' : typeof data.raw),
          timestamp: data.timestamp || Date.now(),
          raw: data.raw,
          text: data.text ?? null
        };
        this.handleMessage(message, message.timestamp);
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
    // [PO-16] 이미 파싱된 데이터가 있더라도, 구조화된 ParsedMessage 형태가 아니면 다시 파싱 시도
    let parsed = data.parsed;
    if (!parsed || typeof parsed.type !== 'string') {
      parsed = this.parser.parse(data.text ?? data.raw);
    }

    const enriched: WebSocketMessage = { ...data, parsed }
    this.messageCallbacks.forEach(cb => cb(enriched))

    // [PO-17] 자산 코드 추적 (changeSymbol 메시지 가로채기)
    if (parsed && Array.isArray(parsed)) {
       const event = parsed[0];
       const payload = parsed[1];
       if (event === 'changeSymbol' && payload?.asset) {
          this.lastAssetId = payload.asset;
          console.log(`[PO] [WS] 🎯 Tracked Active Asset ID: ${this.lastAssetId}`);
       }
    }

    // [PO-17] 디버깅 로그 추가
    if (parsed && parsed.type === 'candle_history') {
       const candles = parsed.data as CandleData[];
       console.log(`[PO] [WS-Interceptor] Candle History Detected! Count: ${candles?.length || 0}`);
       if (candles && candles.length > 0) {
          const symbol = candles[0].symbol || 'UNKNOWN';
          console.log(`[PO] [WS] History/Bulk Captured: ${candles.length} candles for ${symbol}`);
          this.historyCallbacks.forEach(cb => cb(candles));
       }
    } else if (parsed && (parsed.type === 'candle_data' || parsed.type === 'price_update') && !Array.isArray(parsed.data)) {
        // 단일 객체 대응
        const candle = parsed.data as CandleData;
        if (candle && candle.open && candle.close) {
           this.historyCallbacks.forEach(cb => cb([candle]));
        }
    }

    const priceUpdate = parsed ? this.parser.extractPrice(parsed.raw ?? parsed) : null
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

  /**
   * [PO-17] WebSocket을 통해 직접 메시지 전송 (Bridge 경유)
   */
  send(payload: any, urlPart?: string): void {
    window.postMessage({
      source: 'pq-content',
      type: 'ws-send',
      payload,
      urlPart
    }, '*');
  }

  getActiveAssetId(): string | null {
    return this.lastAssetId;
  }
}

export function getWebSocketInterceptor(): WebSocketInterceptor {
  return WebSocketInterceptor.getInstance()
}

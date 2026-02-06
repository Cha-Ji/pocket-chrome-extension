// ============================================================
// WebSocket Interceptor - Content Script Module
// ============================================================
// inject-websocket.ts에서 전달된 CustomEvent를 수신하고
// WebSocket 메시지를 분석하여 가격 데이터를 추출합니다.
// ============================================================

import { getWebSocketParser, WebSocketParser } from './websocket-parser'
import type {
  PriceUpdate,
  WebSocketConnection,
  WebSocketMessage,
  WebSocketEvent,
} from './websocket-types'

export type { PriceUpdate, WebSocketConnection, WebSocketMessage, WebSocketEvent } from './websocket-types'

type PriceUpdateCallback = (update: PriceUpdate) => void
type MessageCallback = (message: WebSocketMessage) => void
type ConnectionCallback = (connection: WebSocketConnection) => void

class WebSocketInterceptor {
  private connections: Map<string, WebSocketConnection> = new Map()
  private messageBuffer: WebSocketMessage[] = []
  private maxBufferSize = 1000
  private isInstalled = false
  private isListening = false
  private analysisMode = true // 분석 모드: 모든 메시지 로깅
  private parser: WebSocketParser
  private boundHandler: EventListener

  // 콜백 핸들러
  private priceUpdateCallbacks: PriceUpdateCallback[] = []
  private messageCallbacks: MessageCallback[] = []
  private connectionCallbacks: ConnectionCallback[] = []

  // 싱글톤 인스턴스
  private static instance: WebSocketInterceptor | null = null

  static getInstance(): WebSocketInterceptor {
    if (!WebSocketInterceptor.instance) {
      WebSocketInterceptor.instance = new WebSocketInterceptor()
    }
    return WebSocketInterceptor.instance
  }

  private constructor() {
    this.parser = getWebSocketParser()
    this.boundHandler = this.handleEvent.bind(this) as EventListener
  }

  // ============================================================
  // Initialization
  // ============================================================

  /**
   * WebSocket 인터셉터 시작
   */
  start(): void {
    if (this.isListening) {
      console.log('[WS Interceptor] Already listening')
      return
    }

    console.log('[WS Interceptor] Starting...')
    
    // CustomEvent 리스너 등록
    this.setupEventListener()
    
    // inject 스크립트 주입
    this.injectScript()
    
    this.isListening = true
    console.log('[WS Interceptor] Started successfully')
  }

  /**
   * WebSocket 인터셉터 중지
   */
  stop(): void {
    if (!this.isListening) return

    window.removeEventListener('pocket-quant-ws', this.boundHandler)
    this.isListening = false
    console.log('[WS Interceptor] Stopped')
  }

  // ============================================================
  // Script Injection
  // ============================================================

  private injectScript(): void {
    try {
      // 이미 주입되었는지 확인
      if (document.querySelector('script[data-pocket-quant-ws]')) {
        console.log('[WS Interceptor] Script already injected')
        return
      }

      const script = document.createElement('script')
      script.src = chrome.runtime.getURL('inject-websocket.js')
      script.setAttribute('data-pocket-quant-ws', 'true')
      script.onload = () => {
        console.log('[WS Interceptor] Inject script loaded')
        script.remove() // 로드 후 script 태그 제거 (코드는 이미 실행됨)
      }
      script.onerror = (e) => {
        console.error('[WS Interceptor] Failed to load inject script:', e)
      }
      
      // document_start에서 실행되면 head가 없을 수 있음
      const target = document.head || document.documentElement
      target.appendChild(script)
    } catch (error) {
      console.error('[WS Interceptor] Failed to inject script:', error)
    }
  }

  // ============================================================
  // Event Handling
  // ============================================================

  private setupEventListener(): void {
    window.addEventListener('pocket-quant-ws', this.boundHandler)
  }

  private handleEvent(event: CustomEvent<WebSocketEvent>): void {
    const { type, data, timestamp } = event.detail

    switch (type) {
      case 'installed':
        this.isInstalled = true
        console.log('[WS Interceptor] Inject script confirmed installed')
        break

      case 'connection':
        this.handleConnection(data)
        break

      case 'open':
        this.handleOpen(data)
        break

      case 'close':
        this.handleClose(data)
        break

      case 'error':
        this.handleError(data)
        break

      case 'message':
        this.handleMessage(data, timestamp)
        break
    }
  }

  private handleConnection(data: any): void {
    const connection: WebSocketConnection = {
      id: data.id,
      url: data.url,
      isPriceRelated: data.isPriceRelated,
      readyState: 'connecting',
      messageCount: 0,
      lastMessageAt: null,
    }
    this.connections.set(data.id, connection)
    
    if (this.analysisMode) {
      console.log('[WS Interceptor] New connection:', connection)
    }
    
    this.connectionCallbacks.forEach(cb => cb(connection))
  }

  private handleOpen(data: any): void {
    const connection = this.connections.get(data.connectionId)
    if (connection) {
      connection.readyState = 'open'
      
      if (this.analysisMode) {
        console.log('[WS Interceptor] Connection opened:', data.connectionId)
      }
      
      this.connectionCallbacks.forEach(cb => cb(connection))
    }
  }

  private handleClose(data: any): void {
    const connection = this.connections.get(data.connectionId)
    if (connection) {
      connection.readyState = 'closed'
      
      if (this.analysisMode) {
        console.log('[WS Interceptor] Connection closed:', data.connectionId, data.code, data.reason)
      }
      
      this.connectionCallbacks.forEach(cb => cb(connection))
    }
  }

  private handleError(data: any): void {
    const connection = this.connections.get(data.connectionId)
    if (connection) {
      console.warn('[WS Interceptor] Connection error:', data.connectionId)
    }
  }

  private handleMessage(data: WebSocketMessage, timestamp: number): void {
    const connection = this.connections.get(data.connectionId)
    if (connection) {
      connection.messageCount++
      connection.lastMessageAt = timestamp
    }

    // 버퍼에 메시지 저장
    this.messageBuffer.push(data)
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer.shift()
    }

    // 분석 모드: 모든 메시지 로깅
    if (this.analysisMode) {
      this.logMessageForAnalysis(data)
    }

    // 메시지 콜백 호출
    this.messageCallbacks.forEach(cb => cb(data))

    // 가격 데이터 추출 시도
    const priceUpdate = this.tryExtractPrice(data)
    if (priceUpdate) {
      this.priceUpdateCallbacks.forEach(cb => cb(priceUpdate))
    }
  }

  // ============================================================
  // Message Analysis (Phase 1: 탐색 모드)
  // ============================================================

  private logMessageForAnalysis(message: WebSocketMessage): void {
    const { connectionId, url, parsed, rawType } = message
    
    // 가격 관련 데이터가 있을 수 있는 필드 탐지
    const priceIndicators = ['price', 'bid', 'ask', 'close', 'open', 'high', 'low', 'value', 'rate', 'quote']
    const symbolIndicators = ['symbol', 'asset', 'pair', 'ticker', 'instrument', 'name']
    
    let hasPriceField = false
    let hasSymbolField = false
    
    if (typeof parsed === 'object' && parsed !== null) {
      const jsonStr = JSON.stringify(parsed).toLowerCase()
      hasPriceField = priceIndicators.some(ind => jsonStr.includes(ind))
      hasSymbolField = symbolIndicators.some(ind => jsonStr.includes(ind))
    }

    // 가격 관련 메시지만 상세 로깅
    if (hasPriceField || hasSymbolField) {
      console.log('[WS Analysis] 📊 Potential price data:', {
        connectionId,
        url: url.substring(0, 50) + '...',
        parsed,
        hasPriceField,
        hasSymbolField,
      })
    }
  }

  // ============================================================
  // Price Extraction (WebSocketParser 사용)
  // ============================================================

  private tryExtractPrice(message: WebSocketMessage): PriceUpdate | null {
    const { parsed } = message

    // WebSocketParser를 사용하여 가격 추출
    const priceUpdate = this.parser.extractPrice(parsed)
    
    if (priceUpdate) {
      // 타임스탬프 보정 (메시지 타임스탬프 사용)
      return {
        ...priceUpdate,
        timestamp: priceUpdate.timestamp || message.timestamp,
      }
    }

    return null
  }

  /**
   * 파서 인스턴스 반환 (패턴 등록용)
   */
  getParser(): WebSocketParser {
    return this.parser
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * 가격 업데이트 콜백 등록
   */
  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.priceUpdateCallbacks.push(callback)
    return () => {
      const index = this.priceUpdateCallbacks.indexOf(callback)
      if (index > -1) this.priceUpdateCallbacks.splice(index, 1)
    }
  }

  /**
   * 메시지 콜백 등록
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.push(callback)
    return () => {
      const index = this.messageCallbacks.indexOf(callback)
      if (index > -1) this.messageCallbacks.splice(index, 1)
    }
  }

  /**
   * 연결 상태 변경 콜백 등록
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback)
    return () => {
      const index = this.connectionCallbacks.indexOf(callback)
      if (index > -1) this.connectionCallbacks.splice(index, 1)
    }
  }

  /**
   * 분석 모드 설정
   */
  setAnalysisMode(enabled: boolean): void {
    this.analysisMode = enabled
    console.log(`[WS Interceptor] Analysis mode: ${enabled ? 'ON' : 'OFF'}`)
  }

  /**
   * 현재 연결 목록 반환
   */
  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * 특정 연결의 메시지 반환
   */
  getMessages(connectionId?: string, limit = 100): WebSocketMessage[] {
    let messages = this.messageBuffer
    if (connectionId) {
      messages = messages.filter(m => m.connectionId === connectionId)
    }
    return messages.slice(-limit)
  }

  /**
   * 상태 정보 반환
   */
  getStatus(): {
    isInstalled: boolean
    isListening: boolean
    analysisMode: boolean
    connectionCount: number
    messageCount: number
    parserPatterns: string[]
    unknownMessageTypes: string[]
  } {
    return {
      isInstalled: this.isInstalled,
      isListening: this.isListening,
      analysisMode: this.analysisMode,
      connectionCount: this.connections.size,
      messageCount: this.messageBuffer.length,
      parserPatterns: this.parser.getPatterns(),
      unknownMessageTypes: this.parser.getUnknownMessageTypes(),
    }
  }

  /**
   * 메시지 버퍼 클리어
   */
  clearMessages(): void {
    this.messageBuffer = []
  }
}

// 싱글톤 인스턴스 접근 함수
export function getWebSocketInterceptor(): WebSocketInterceptor {
  return WebSocketInterceptor.getInstance()
}

export { WebSocketInterceptor }

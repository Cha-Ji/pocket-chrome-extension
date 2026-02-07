// ============================================================
// WebSocket Interceptor - Injected Script (Page Context)
// ============================================================
// 이 스크립트는 페이지 컨텍스트에서 실행되어 WebSocket을 오버라이드합니다.
// Content Script는 페이지의 window 객체에 직접 접근할 수 없으므로,
// CustomEvent를 통해 데이터를 전달합니다.
// ============================================================

;(function() {
  'use strict'

  // 이미 인터셉터가 설치되었는지 확인
  if ((window as any).__pocketQuantWsInterceptor) {
    console.log('[WS Intercept] Already installed, skipping...')
    return
  }
  (window as any).__pocketQuantWsInterceptor = true

  console.log('[WS Intercept] Installing WebSocket interceptor...')

  // 원본 WebSocket 저장
  const OriginalWebSocket = window.WebSocket

  // WebSocket 연결 추적
  const connections: Map<WebSocket, { url: string; id: string }> = new Map()
  let connectionIdCounter = 0

  // 가격 관련 URL 패턴 (Pocket Option)
  const PRICE_URL_PATTERNS = [
    /wss?:\/\/.*pocketoption/i,
    /wss?:\/\/.*po\.trade/i,
    /wss?:\/\/.*po2\.trade/i,
    /socket/i,
    /stream/i,
    /price/i,
    /quote/i,
    /tick/i,
  ]

  // URL이 가격 데이터 관련인지 확인
  function isPriceRelatedUrl(url: string): boolean {
    return PRICE_URL_PATTERNS.some(pattern => pattern.test(url))
  }

  // CustomEvent 디스패치 (Content Script로 데이터 전달)
  function dispatchToContentScript(type: string, data: any): void {
    window.dispatchEvent(new CustomEvent('pocket-quant-ws', {
      detail: { type, data, timestamp: Date.now() }
    }))
  }

  // 메시지 파싱 시도
  function tryParseMessage(data: any): any {
    // 문자열인 경우 JSON 파싱 시도
    if (typeof data === 'string') {
      try {
        return JSON.parse(data)
      } catch {
        return { raw: data, type: 'string' }
      }
    }
    
    // ArrayBuffer인 경우
    if (data instanceof ArrayBuffer) {
      try {
        const decoder = new TextDecoder('utf-8')
        const text = decoder.decode(data)
        try {
          return JSON.parse(text)
        } catch {
          return { raw: text, type: 'binary-text' }
        }
      } catch {
        return { type: 'binary', byteLength: data.byteLength }
      }
    }
    
    // Blob인 경우 (비동기 처리 필요)
    if (data instanceof Blob) {
      return { type: 'blob', size: data.size }
    }
    
    return { type: 'unknown', data }
  }

  // WebSocket 생성자 오버라이드
  const PatchedWebSocket = function(
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ): WebSocket {
    const urlString = url.toString()
    const connectionId = `ws-${++connectionIdCounter}`
    const isPriceRelated = isPriceRelatedUrl(urlString)

    console.log(`[WS Intercept] New connection: ${connectionId}`, {
      url: urlString,
      isPriceRelated,
      protocols
    })

    // 연결 정보 알림
    dispatchToContentScript('connection', {
      id: connectionId,
      url: urlString,
      isPriceRelated,
      protocols
    })

    // 원본 WebSocket 생성
    const ws = protocols 
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url)

    // 연결 추적
    connections.set(ws, { url: urlString, id: connectionId })

    // 메시지 이벤트 가로채기
    const originalAddEventListener = ws.addEventListener.bind(ws)
    ws.addEventListener = function(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void {
      if (type === 'message') {
        const wrappedListener = function(event: MessageEvent) {
          // 가격 관련 연결만 상세 로깅
          if (isPriceRelated) {
            const parsed = tryParseMessage(event.data)
            dispatchToContentScript('message', {
              connectionId,
              url: urlString,
              parsed,
              rawType: typeof event.data,
              timestamp: Date.now()
            })
          }

          // 원본 리스너 호출
          if (typeof listener === 'function') {
            listener.call(ws, event)
          } else {
            listener.handleEvent(event)
          }
        }
        return originalAddEventListener(type, wrappedListener as EventListener, options)
      }
      return originalAddEventListener(type, listener, options)
    }

    // onmessage 프로퍼티 감시
    let _onmessage: ((event: MessageEvent) => void) | null = null
    Object.defineProperty(ws, 'onmessage', {
      get: () => _onmessage,
      set: (handler: ((event: MessageEvent) => void) | null) => {
        _onmessage = handler
        if (handler && isPriceRelated) {
          ws.addEventListener('message', function(event: MessageEvent) {
            const parsed = tryParseMessage(event.data)
            dispatchToContentScript('message', {
              connectionId,
              url: urlString,
              parsed,
              rawType: typeof event.data,
              timestamp: Date.now()
            })
          })
        }
      }
    })

    // 연결 상태 이벤트
    ws.addEventListener('open', () => {
      console.log(`[WS Intercept] Connection opened: ${connectionId}`)
      dispatchToContentScript('open', { connectionId, url: urlString })
    })

    ws.addEventListener('close', (event) => {
      console.log(`[WS Intercept] Connection closed: ${connectionId}`, event.code, event.reason)
      dispatchToContentScript('close', { 
        connectionId, 
        url: urlString,
        code: event.code,
        reason: event.reason 
      })
      connections.delete(ws)
    })

    ws.addEventListener('error', () => {
      console.log(`[WS Intercept] Connection error: ${connectionId}`)
      dispatchToContentScript('error', { connectionId, url: urlString })
    })

    return ws
  } as unknown as typeof WebSocket

  // WebSocket 프로토타입 복사
  PatchedWebSocket.prototype = OriginalWebSocket.prototype
  // Static readonly 속성은 Object.defineProperty로 정의
  Object.defineProperty(PatchedWebSocket, 'CONNECTING', { value: OriginalWebSocket.CONNECTING })
  Object.defineProperty(PatchedWebSocket, 'OPEN', { value: OriginalWebSocket.OPEN })
  Object.defineProperty(PatchedWebSocket, 'CLOSING', { value: OriginalWebSocket.CLOSING })
  Object.defineProperty(PatchedWebSocket, 'CLOSED', { value: OriginalWebSocket.CLOSED })

  // 전역 WebSocket 교체
  ;(window as any).WebSocket = PatchedWebSocket

  // 상태 확인 함수 (디버깅용)
  ;(window as any).__pocketQuantWsStatus = function() {
    return {
      installed: true,
      activeConnections: connections.size,
      connections: Array.from(connections.entries()).map(([ws, info]) => ({
        id: info.id,
        url: info.url,
        readyState: ws.readyState,
        readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]
      }))
    }
  }

  console.log('[WS Intercept] WebSocket interceptor installed successfully')
  dispatchToContentScript('installed', { timestamp: Date.now() })
})()

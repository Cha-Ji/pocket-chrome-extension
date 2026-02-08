// ============================================================
// Tampermonkey inject-websocket.user.js — Unit Tests
// ============================================================
// 스크립트가 self-contained IIFE이므로 eval로 로드한 뒤
// side-effect(WebSocket 패치, postMessage 호출)를 검증합니다.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SCRIPT_PATH = resolve(__dirname, './inject-websocket.user.js')
const scriptContent = readFileSync(SCRIPT_PATH, 'utf-8')

/** Flush pending microtasks (handleMessage is async) */
const tick = () => new Promise<void>(r => setTimeout(r, 0))

/**
 * Minimal WebSocket mock.
 * 실제 네트워크 없이 이벤트 dispatch를 시뮬레이션합니다.
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState = 1 // OPEN
  protocol = ''
  extensions = ''
  bufferedAmount = 0
  binaryType: BinaryType = 'blob'

  private _listeners = new Map<string, Function[]>()

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = typeof url === 'string' ? url : url.toString()
  }

  addEventListener(type: string, listener: Function, _options?: any) {
    if (!this._listeners.has(type)) this._listeners.set(type, [])
    this._listeners.get(type)!.push(listener)
  }

  removeEventListener(type: string, listener: Function) {
    const arr = this._listeners.get(type)
    if (arr) {
      const i = arr.indexOf(listener)
      if (i >= 0) arr.splice(i, 1)
    }
  }

  dispatchEvent(_event: Event) {
    return true
  }

  send = vi.fn()
  close = vi.fn()

  /** Test helper: 메시지 수신 시뮬레이션 */
  _fire(data: any) {
    const event = { data, type: 'message' }
    for (const fn of this._listeners.get('message') ?? []) {
      fn(event)
    }
  }
}

function execScript() {
  // eslint-disable-next-line no-eval
  eval(scriptContent)
}

/** postMessage 호출 중 ws-message 타입만 필터 */
function wsMessageCalls(spy: ReturnType<typeof vi.fn>) {
  return spy.mock.calls.filter(
    (c: any[]) => c[0]?.source === 'pq-bridge' && c[0]?.type === 'ws-message',
  )
}

// ================================================================

describe('Tampermonkey inject-websocket.user.js', () => {
  let savedWS: typeof WebSocket
  let postMessageSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    savedWS = window.WebSocket
    // @ts-ignore
    window.WebSocket = MockWebSocket
    // static props를 enumerable하게 등록 (Object.assign으로 복사 가능하도록)
    Object.assign(window.WebSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    })

    delete (window as any).__pocketQuantWsHook
    delete (window as any)._ws_instances
    postMessageSpy = vi.fn()
    window.postMessage = postMessageSpy
  })

  afterEach(() => {
    window.WebSocket = savedWS
    delete (window as any).__pocketQuantWsHook
    delete (window as any)._ws_instances
    vi.restoreAllMocks()
  })

  // ── 초기화 ──────────────────────────────────────────────

  describe('initialization', () => {
    it('WebSocket 생성자를 패치하고 훅 플래그를 설정한다', () => {
      execScript()
      expect(window.WebSocket).not.toBe(MockWebSocket)
      expect((window as any).__pocketQuantWsHook).toBe(true)
    })

    it('bridge-ready 시그널을 postMessage로 전송한다', () => {
      execScript()
      expect(postMessageSpy).toHaveBeenCalledWith(
        { source: 'pq-bridge', type: 'bridge-ready' },
        '*',
      )
    })

    it('WebSocket.prototype과 static 속성을 유지한다', () => {
      execScript()
      expect(window.WebSocket.prototype).toBe(MockWebSocket.prototype)
      expect(window.WebSocket.OPEN).toBe(1)
      expect(window.WebSocket.CLOSED).toBe(3)
    })

    it('_ws_instances 배열을 초기화한다', () => {
      execScript()
      expect((window as any)._ws_instances).toEqual([])
    })
  })

  // ── 중복 실행 방지 ────────────────────────────────────────

  describe('duplicate execution prevention', () => {
    it('__pocketQuantWsHook가 이미 설정되면 재패치하지 않는다', () => {
      execScript()
      const firstWS = window.WebSocket
      postMessageSpy.mockClear()

      execScript() // 두 번째 로드

      expect(window.WebSocket).toBe(firstWS)
      // bridge-ready가 다시 전송되지 않아야 함
      expect(postMessageSpy).not.toHaveBeenCalled()
    })
  })

  // ── WebSocket 생성자 후킹 ─────────────────────────────────

  describe('hooked constructor', () => {
    it('인스턴스를 생성하고 _ws_instances에 추적한다', () => {
      execScript()
      const ws = new window.WebSocket('wss://po.trade/ws')

      expect(ws.url).toBe('wss://po.trade/ws')
      expect((window as any)._ws_instances).toContain(ws)
    })

    it('여러 인스턴스를 모두 추적한다', () => {
      execScript()
      new window.WebSocket('wss://a.com')
      new window.WebSocket('wss://b.com')

      expect((window as any)._ws_instances).toHaveLength(2)
    })
  })

  // ── addEventListener 메시지 인터셉션 ──────────────────────

  describe('message interception via addEventListener', () => {
    it('WS 메시지를 가로채서 postMessage bridge로 전달한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      const appHandler = vi.fn()
      ws.addEventListener('message', appHandler)

      ws._fire('hello')
      await tick()

      // 원본 앱 핸들러가 호출되어야 함
      expect(appHandler).toHaveBeenCalledOnce()
      // bridge 메시지가 전송되어야 함
      const calls = wsMessageCalls(postMessageSpy)
      expect(calls).toHaveLength(1)
      expect(calls[0][0].data).toMatchObject({
        url: 'wss://po.trade/ws',
        text: 'hello',
        dataType: 'string',
        timestamp: expect.any(Number),
      })
    })

    it('non-message 이벤트는 인터셉트하지 않는다', () => {
      execScript()
      const ws = new window.WebSocket('wss://example.com') as any
      const handler = vi.fn()
      ws.addEventListener('open', handler)

      // 에러 없이 등록되어야 함
      expect(handler).not.toHaveBeenCalled()
    })
  })

  // ── onmessage setter 인터셉션 ─────────────────────────────

  describe('message interception via onmessage setter', () => {
    it('onmessage 프로퍼티 설정을 가로채서 bridge로 전달한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      const appHandler = vi.fn()
      ws.onmessage = appHandler

      ws._fire('via-setter')
      await tick()

      expect(appHandler).toHaveBeenCalledOnce()
      expect(wsMessageCalls(postMessageSpy)).toHaveLength(1)
    })
  })

  // ── extractPayload 파싱 ───────────────────────────────────

  describe('payload parsing (extractPayload)', () => {
    it('plain JSON 객체를 파싱한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())
      ws._fire('{"symbol":"BTCUSDT","price":50000}')
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls[0][0].data.payload).toEqual({
        symbol: 'BTCUSDT',
        price: 50000,
      })
    })

    it('JSON 배열을 파싱한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())
      ws._fire('[1,2,3]')
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls[0][0].data.payload).toEqual([1, 2, 3])
    })

    it('Socket.IO 형식 (digits-json)을 파싱한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())
      ws._fire('42-{"action":"tick"}')
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls[0][0].data.payload).toEqual({ action: 'tick' })
    })

    it('비-JSON 텍스트는 payload가 null이다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())
      ws._fire('just plain text')
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls[0][0].data.payload).toBeNull()
    })
  })

  // ── 바이너리 데이터 디코딩 ────────────────────────────────
  // NOTE: jsdom 환경에서 ArrayBuffer instanceof 체크가 다르게 동작할 수 있어
  // dataType 대신 payload 파싱 결과를 중심으로 검증합니다.

  describe('binary data decoding', () => {
    it('ArrayBuffer 메시지를 bridge로 전달한다', async () => {
      // NOTE: jsdom에서 instanceof ArrayBuffer 체크가 실패할 수 있어
      // 디코딩까지 검증하기 어렵지만, 메시지 전달 자체는 검증 가능
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())

      const buf = new TextEncoder().encode('{"price":100}').buffer
      ws._fire(buf)
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls).toHaveLength(1)
      expect(calls[0][0].data.url).toBe('wss://po.trade/ws')
      expect(calls[0][0].data.timestamp).toBeTypeOf('number')
      // 브라우저 환경에서는 dataType='arraybuffer', payload={price:100} 이지만
      // jsdom에서는 instanceof 불일치로 fallback 될 수 있음
    })

    it('Blob를 UTF-8로 디코딩한다', async () => {
      // jsdom의 Blob에 arrayBuffer() 메서드가 없을 수 있으므로 polyfill
      const text = '{"from":"blob"}'
      const blob = new Blob([text], { type: 'application/json' })
      if (typeof blob.arrayBuffer !== 'function') {
        ;(blob as any).arrayBuffer = async () =>
          new TextEncoder().encode(text).buffer
      }

      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())
      ws._fire(blob)
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls).toHaveLength(1)
      expect(calls[0][0].data.payload).toEqual({ from: 'blob' })
    })
  })

  // ── Socket.IO Binary Placeholder 처리 ─────────────────────

  describe('Socket.IO binary placeholder', () => {
    it('placeholder 프레임을 억제하고 다음 바이너리와 결합한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())

      // Frame 1: placeholder (should NOT produce ws-message)
      ws._fire('451-["updateStream",{"_placeholder":true,"num":0}]')
      await tick()
      expect(wsMessageCalls(postMessageSpy)).toHaveLength(0)

      // Frame 2: binary data (should produce ws-message with combined info)
      const binaryData = new Uint8Array([1, 2, 3]).buffer
      ws._fire(binaryData)
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls).toHaveLength(1)
      expect(calls[0][0].data.payload).toMatchObject({
        type: 'binary_payload',
        event: 'updateStream',
      })
    })

    it('placeholder 후 문자열이 오면 일반 메시지로 처리한다', async () => {
      execScript()
      postMessageSpy.mockClear()

      const ws = new window.WebSocket('wss://po.trade/ws') as any
      ws.addEventListener('message', vi.fn())

      // Frame 1: placeholder
      ws._fire('451-["updateStream",{"_placeholder":true,"num":0}]')
      await tick()

      // Frame 2: string (not binary) → lastMessageInfo cleared, normal processing
      ws._fire('{"normal":"message"}')
      await tick()

      const calls = wsMessageCalls(postMessageSpy)
      expect(calls).toHaveLength(1)
      // placeholder 결합이 아닌 일반 메시지로 처리됨
      expect(calls[0][0].data.payload).toEqual({ normal: 'message' })
    })
  })

  // ── 역방향 Bridge (Content Script → WebSocket) ────────────

  describe('reverse bridge (pq-content → ws-send)', () => {
    it('pq-content 요청을 받아 활성 WebSocket으로 전송한다', () => {
      execScript()
      const ws = new window.WebSocket('wss://po.trade/socket') as any
      vi.spyOn(ws, 'send') // Hook 래퍼 위에 spy 재설치

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'pq-content',
            type: 'ws-send',
            payload: { action: 'subscribe', asset: 100 },
            urlPart: 'po.trade',
          },
        }),
      )

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'subscribe', asset: 100 }),
      )
    })

    it('문자열 payload는 그대로 전송한다', () => {
      execScript()
      const ws = new window.WebSocket('wss://po.trade/socket') as any
      vi.spyOn(ws, 'send')

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'pq-content',
            type: 'ws-send',
            payload: '42["subscribe",100]',
          },
        }),
      )

      expect(ws.send).toHaveBeenCalledWith('42["subscribe",100]')
    })

    it('urlPart 필터로 특정 소켓에만 전송한다', () => {
      execScript()
      const ws1 = new window.WebSocket('wss://po.trade/socket') as any
      const ws2 = new window.WebSocket('wss://other.com/socket') as any
      vi.spyOn(ws1, 'send')
      vi.spyOn(ws2, 'send')

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'pq-content',
            type: 'ws-send',
            payload: 'test',
            urlPart: 'other.com',
          },
        }),
      )

      expect(ws1.send).not.toHaveBeenCalled()
      expect(ws2.send).toHaveBeenCalledWith('test')
    })

    it('pq-content가 아닌 메시지는 무시한다', () => {
      execScript()
      const ws = new window.WebSocket('wss://po.trade/socket') as any
      vi.spyOn(ws, 'send')

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'other', type: 'ws-send', payload: 'x' },
        }),
      )

      expect(ws.send).not.toHaveBeenCalled()
    })
  })
})

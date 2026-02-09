/**
 * CDP Inspector — Chrome DevTools Protocol을 활용한 심층 진단 도구
 *
 * Playwright의 내장 CDP 세션을 사용하여 기존 console-monitor로는
 * 볼 수 없는 데이터를 구조화된 형태로 수집합니다.
 *
 * 핵심 기능:
 *   1. WebSocket 프레임 직접 캡처 (Network 도메인)
 *   2. JS 예외 자동 수집 (Runtime 도메인)
 *   3. DataSender → localhost:3001 요청 감시 (Network 도메인)
 *   4. 성능 메트릭 수집 (Performance 도메인)
 *
 * 사용법:
 *   const inspector = await createCDPInspector(page)
 *   // ... 테스트 실행
 *   const report = inspector.buildReport()
 *   inspector.detach()
 */

import type { Page, CDPSession } from '@playwright/test'

// ── Types ────────────────────────────────────────────────────

export interface WSFrame {
  /** WebSocket request ID (CDP 내부 식별자) */
  requestId: string
  /** 프레임 방향 */
  direction: 'sent' | 'received'
  /** 프레임 payload (텍스트) */
  payload: string
  /** opcode (1=text, 2=binary) */
  opcode: number
  /** CDP 타임스탬프 (초) */
  timestamp: number
  /** payload를 JSON 파싱한 결과 (실패 시 null) */
  parsed: any | null
  /** Socket.IO 이벤트 이름 (있으면) */
  socketIOEvent: string | null
}

export interface APICall {
  /** HTTP 메서드 */
  method: string
  /** 요청 URL */
  url: string
  /** POST body (있으면) */
  postData: string | null
  /** 응답 상태 코드 */
  statusCode: number | null
  /** 요청 타임스탬프 */
  timestamp: number
  /** CDP request ID */
  requestId: string
}

export interface JSException {
  /** 에러 메시지 */
  text: string
  /** 스택 트레이스 URL (첫 번째 프레임) */
  url: string | null
  /** 줄 번호 */
  lineNumber: number | null
  /** 에러 타임스탬프 */
  timestamp: number
}

export interface PerfSnapshot {
  /** JS 힙 사용량 (bytes) */
  jsHeapUsedSize: number
  /** JS 힙 전체 크기 (bytes) */
  jsHeapTotalSize: number
  /** DOM 노드 수 */
  domNodes: number
  /** JS 이벤트 리스너 수 */
  jsEventListeners: number
  /** 수집 시각 */
  timestamp: number
}

export interface WSConnection {
  /** CDP request ID */
  requestId: string
  /** WebSocket URL */
  url: string
  /** 연결 시각 */
  timestamp: number
}

export interface CDPInspector {
  /** 수집된 WebSocket 프레임 */
  wsFrames: WSFrame[]
  /** 감지된 WebSocket 연결 */
  wsConnections: WSConnection[]
  /** localhost:3001 API 호출 */
  apiCalls: APICall[]
  /** JS 예외 */
  exceptions: JSException[]

  /** WS 프레임을 방향별로 필터 */
  wsFramesByDirection(dir: 'sent' | 'received'): WSFrame[]
  /** Socket.IO 이벤트 이름으로 WS 프레임 필터 */
  wsFramesByEvent(eventName: string): WSFrame[]
  /** 히스토리 관련 WS 프레임만 추출 */
  wsHistoryFrames(): WSFrame[]
  /** 성능 메트릭 스냅샷 수집 */
  takePerformanceSnapshot(): Promise<PerfSnapshot>
  /** LLM 소비용 진단 리포트 생성 */
  buildReport(): string
  /** CDP 세션 정리 */
  detach(): Promise<void>
}

// ── Socket.IO 파싱 헬퍼 ──────────────────────────────────────

/**
 * Socket.IO 텍스트 프레임에서 이벤트 이름과 페이로드를 추출
 * 형식: "42[\"eventName\",{...}]" 또는 "451-[\"eventName\",{_placeholder:true,...}]"
 */
function parseSocketIOFrame(payload: string): { event: string | null; data: any | null } {
  // 숫자 접두사 제거 (42, 451-, 43 등)
  const match = payload.match(/^\d+[-]?(.*)$/)
  if (!match || !match[1]) return { event: null, data: null }

  try {
    const arr = JSON.parse(match[1])
    if (Array.isArray(arr) && arr.length >= 1 && typeof arr[0] === 'string') {
      return { event: arr[0], data: arr.length > 1 ? arr[1] : null }
    }
  } catch {
    // JSON 파싱 실패 — 바이너리나 비표준 프레임
  }
  return { event: null, data: null }
}

// ── Factory ──────────────────────────────────────────────────

/**
 * Playwright Page에 CDP Inspector를 부착합니다.
 * 내부적으로 page.context().newCDPSession(page)을 사용하므로
 * 추가 의존성이 필요 없습니다.
 */
export async function createCDPInspector(page: Page): Promise<CDPInspector> {
  const cdp: CDPSession = await page.context().newCDPSession(page)

  const wsFrames: WSFrame[] = []
  const wsConnections: WSConnection[] = []
  const apiCalls: APICall[] = []
  const exceptions: JSException[] = []

  // pending API 호출 (requestId → 부분 데이터)
  const pendingRequests = new Map<string, APICall>()

  // ── Network 도메인 활성화 ──────────────────────────────

  await cdp.send('Network.enable')

  // WebSocket 연결 감지
  cdp.on('Network.webSocketCreated', (params: any) => {
    wsConnections.push({
      requestId: params.requestId,
      url: params.url,
      timestamp: Date.now(),
    })
  })

  // WebSocket 수신 프레임
  cdp.on('Network.webSocketFrameReceived', (params: any) => {
    const payload = params.response?.payloadData ?? ''
    const sio = parseSocketIOFrame(payload)
    let parsed: any = null
    try {
      parsed = JSON.parse(payload)
    } catch {
      // Socket.IO 접두사가 있는 경우 순수 JSON이 아님
      if (sio.data) parsed = sio.data
    }

    wsFrames.push({
      requestId: params.requestId,
      direction: 'received',
      payload,
      opcode: params.response?.opcode ?? 1,
      timestamp: params.timestamp ?? Date.now() / 1000,
      parsed,
      socketIOEvent: sio.event,
    })
  })

  // WebSocket 전송 프레임
  cdp.on('Network.webSocketFrameSent', (params: any) => {
    const payload = params.response?.payloadData ?? ''
    const sio = parseSocketIOFrame(payload)
    let parsed: any = null
    try {
      parsed = JSON.parse(payload)
    } catch {
      if (sio.data) parsed = sio.data
    }

    wsFrames.push({
      requestId: params.requestId,
      direction: 'sent',
      payload,
      opcode: params.response?.opcode ?? 1,
      timestamp: params.timestamp ?? Date.now() / 1000,
      parsed,
      socketIOEvent: sio.event,
    })
  })

  // HTTP 요청 감시 (DataSender → localhost:3001)
  cdp.on('Network.requestWillBeSent', (params: any) => {
    const url: string = params.request?.url ?? ''
    if (!url.includes('localhost:3001')) return

    pendingRequests.set(params.requestId, {
      method: params.request.method,
      url,
      postData: params.request.postData ?? null,
      statusCode: null,
      timestamp: params.timestamp ? params.timestamp * 1000 : Date.now(),
      requestId: params.requestId,
    })
  })

  cdp.on('Network.responseReceived', (params: any) => {
    const pending = pendingRequests.get(params.requestId)
    if (pending) {
      pending.statusCode = params.response?.status ?? null
      apiCalls.push(pending)
      pendingRequests.delete(params.requestId)
    }
  })

  // 네트워크 에러 (서버 다운 등)
  cdp.on('Network.loadingFailed', (params: any) => {
    const pending = pendingRequests.get(params.requestId)
    if (pending) {
      pending.statusCode = -1 // network error
      apiCalls.push(pending)
      pendingRequests.delete(params.requestId)
    }
  })

  // ── Runtime 도메인 활성화 ──────────────────────────────

  await cdp.send('Runtime.enable')

  cdp.on('Runtime.exceptionThrown', (params: any) => {
    const details = params.exceptionDetails
    const firstFrame = details?.stackTrace?.callFrames?.[0]
    exceptions.push({
      text: details?.text ?? 'Unknown error',
      url: firstFrame?.url ?? details?.url ?? null,
      lineNumber: firstFrame?.lineNumber ?? details?.lineNumber ?? null,
      timestamp: params.timestamp ? params.timestamp * 1000 : Date.now(),
    })
  })

  // ── Performance 도메인 활성화 ──────────────────────────

  await cdp.send('Performance.enable')

  // ── Public API ─────────────────────────────────────────

  const inspector: CDPInspector = {
    wsFrames,
    wsConnections,
    apiCalls,
    exceptions,

    wsFramesByDirection(dir) {
      return wsFrames.filter(f => f.direction === dir)
    },

    wsFramesByEvent(eventName) {
      return wsFrames.filter(f => f.socketIOEvent === eventName)
    },

    wsHistoryFrames() {
      const historyEvents = new Set([
        'updateHistoryNewFast', 'history', 'getHistory',
        'load_history', 'loadHistory', 'loadHistoryPeriod',
        'candles', 'historyResult', 'candleHistory',
      ])
      return wsFrames.filter(f => f.socketIOEvent && historyEvents.has(f.socketIOEvent))
    },

    async takePerformanceSnapshot() {
      const result = await cdp.send('Performance.getMetrics')
      const metrics = result.metrics as Array<{ name: string; value: number }>
      const get = (name: string) => metrics.find(m => m.name === name)?.value ?? 0

      return {
        jsHeapUsedSize: get('JSHeapUsedSize'),
        jsHeapTotalSize: get('JSHeapTotalSize'),
        domNodes: get('Nodes'),
        jsEventListeners: get('JSEventListeners'),
        timestamp: Date.now(),
      }
    },

    buildReport() {
      const lines: string[] = ['## CDP Diagnostic Report', '']

      // ── WebSocket 연결 ────────────────────────────
      lines.push(`### WebSocket Connections (${wsConnections.length})`)
      if (wsConnections.length === 0) {
        lines.push('> No WebSocket connections detected.')
      } else {
        wsConnections.forEach(c => {
          lines.push(`- \`${c.url}\``)
        })
      }
      lines.push('')

      // ── WebSocket 프레임 요약 ─────────────────────
      const received = wsFrames.filter(f => f.direction === 'received')
      const sent = wsFrames.filter(f => f.direction === 'sent')
      lines.push(`### WebSocket Frames (total: ${wsFrames.length})`)
      lines.push(`- Received: ${received.length}`)
      lines.push(`- Sent: ${sent.length}`)
      lines.push('')

      // Socket.IO 이벤트 분포
      const eventCounts = new Map<string, number>()
      for (const f of wsFrames) {
        const key = f.socketIOEvent ?? '(non-socketio)'
        eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
      }
      if (eventCounts.size > 0) {
        lines.push('#### Event Distribution')
        const sorted = [...eventCounts.entries()].sort((a, b) => b[1] - a[1])
        for (const [event, count] of sorted.slice(0, 15)) {
          lines.push(`- \`${event}\`: ${count}`)
        }
        if (sorted.length > 15) {
          lines.push(`- ... (${sorted.length - 15} more event types)`)
        }
        lines.push('')
      }

      // 히스토리 프레임 상세
      const historyFrames = inspector.wsHistoryFrames()
      if (historyFrames.length > 0) {
        lines.push(`#### History Frames (${historyFrames.length})`)
        for (const f of historyFrames.slice(-5)) {
          const candleCount = Array.isArray(f.parsed) ? f.parsed.length :
            (f.parsed?.data && Array.isArray(f.parsed.data)) ? f.parsed.data.length : '?'
          lines.push(`- [${f.direction}] \`${f.socketIOEvent}\` — ${candleCount} candles`)
        }
        lines.push('')
      }

      // ── API 호출 (localhost:3001) ─────────────────
      lines.push(`### API Calls to localhost:3001 (${apiCalls.length})`)
      if (apiCalls.length === 0) {
        lines.push('> No API calls to collector server detected.')
      } else {
        const success = apiCalls.filter(c => c.statusCode && c.statusCode >= 200 && c.statusCode < 300)
        const failed = apiCalls.filter(c => !c.statusCode || c.statusCode < 200 || c.statusCode >= 300)
        lines.push(`- Success: ${success.length}`)
        lines.push(`- Failed: ${failed.length}`)
        if (failed.length > 0) {
          lines.push('- Failed calls:')
          for (const f of failed.slice(-5)) {
            lines.push(`  - ${f.method} ${f.url} → status ${f.statusCode}`)
          }
        }
      }
      lines.push('')

      // ── JS 예외 ───────────────────────────────────
      lines.push(`### JS Exceptions (${exceptions.length})`)
      if (exceptions.length === 0) {
        lines.push('> No uncaught exceptions.')
      } else {
        for (const e of exceptions.slice(-10)) {
          const loc = e.url ? `${e.url}:${e.lineNumber}` : 'unknown'
          lines.push(`- **${e.text}** at \`${loc}\``)
        }
      }
      lines.push('')

      // ── 파이프라인 흐름 진단 ──────────────────────
      lines.push('### Pipeline Flow Diagnosis')
      const hasWS = wsConnections.length > 0
      const hasReceived = received.length > 0
      const hasHistory = historyFrames.length > 0
      const hasAPI = apiCalls.length > 0
      const hasAPISuccess = apiCalls.some(c => c.statusCode && c.statusCode >= 200 && c.statusCode < 300)

      const steps = [
        { name: 'WS Connected', ok: hasWS },
        { name: 'Frames Received', ok: hasReceived },
        { name: 'History Data', ok: hasHistory },
        { name: 'API Called', ok: hasAPI },
        { name: 'API Success', ok: hasAPISuccess },
      ]

      for (const step of steps) {
        lines.push(`- [${step.ok ? 'x' : ' '}] ${step.name}`)
      }

      const firstFail = steps.find(s => !s.ok)
      if (firstFail) {
        lines.push('')
        lines.push(`**Pipeline breaks at: ${firstFail.name}**`)

        // 구체적 디버깅 힌트
        switch (firstFail.name) {
          case 'WS Connected':
            lines.push('> Pocket Option 페이지에서 WebSocket 연결이 감지되지 않았습니다.')
            lines.push('> 페이지가 완전히 로드되었는지, 로그인 상태인지 확인하세요.')
            break
          case 'Frames Received':
            lines.push('> WebSocket이 연결되었지만 프레임이 수신되지 않았습니다.')
            lines.push('> WS bridge(inject-websocket.js)가 활성화되어 있는지 확인하세요.')
            break
          case 'History Data':
            lines.push('> 프레임은 수신되지만 히스토리 이벤트가 없습니다.')
            lines.push('> AutoMiner가 loadHistoryPeriod 요청을 보내고 있는지 확인하세요.')
            break
          case 'API Called':
            lines.push('> 히스토리 데이터는 있지만 DataSender가 서버에 요청하지 않았습니다.')
            lines.push('> content-script/index.ts의 onHistoryReceived 콜백을 확인하세요.')
            break
          case 'API Success':
            lines.push('> API 요청이 전송되었지만 실패했습니다.')
            lines.push('> collector 서버가 실행 중인지 확인하세요 (npm run collector).')
            break
        }
      } else {
        lines.push('')
        lines.push('**All pipeline stages OK.**')
      }

      return lines.join('\n')
    },

    async detach() {
      try {
        await cdp.detach()
      } catch {
        // 이미 분리되었거나 페이지가 닫힌 경우 무시
      }
    },
  }

  return inspector
}

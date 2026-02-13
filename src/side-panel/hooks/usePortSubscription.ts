/**
 * Singleton port connection hook for side panel ↔ background communication.
 *
 * Architecture:
 *   - One shared chrome.runtime.Port across all hook consumers (ref-counted)
 *   - Connects on first subscriber, disconnects when last subscriber unmounts
 *   - Auto-reconnects on MV3 service worker sleep/wake (exponential backoff)
 *   - Dispatches incoming messages to registered type-specific handlers
 *
 * Usage:
 *   usePortSubscription('MINER_STATUS_PUSH', (payload) => setStatus(payload))
 *   usePortConnection() // App-level: just keep the port alive
 */

import { useEffect, useRef, useState } from 'react'
import { PORT_CHANNEL } from '../../lib/port-channel'

type MessageHandler = (payload: unknown) => void
type ConnectionListener = (connected: boolean) => void

// ─── Singleton state (shared across all hook instances) ──────

let port: chrome.runtime.Port | null = null
const messageHandlers = new Map<string, Set<MessageHandler>>()
const connectionListeners = new Set<ConnectionListener>()
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let reconnectAttempt = 0
let _isConnected = false
let refCount = 0

function setConnected(state: boolean): void {
  _isConnected = state
  for (const listener of connectionListeners) {
    try { listener(state) } catch { /* ignore */ }
  }
}

function connectPort(): void {
  if (port) return
  try {
    port = chrome.runtime.connect({ name: PORT_CHANNEL })
    reconnectAttempt = 0
    setConnected(true)

    port.onMessage.addListener((msg: { type: string; payload?: unknown }) => {
      const set = messageHandlers.get(msg.type)
      if (set) {
        for (const handler of set) {
          try { handler(msg.payload) } catch { /* ignore handler errors */ }
        }
      }
    })

    port.onDisconnect.addListener(() => {
      port = null
      setConnected(false)

      // Auto-reconnect if there are still active subscribers
      if (refCount > 0 && reconnectAttempt < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempt++, 16000)
        console.log(`[Port] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`)
        reconnectTimer = setTimeout(connectPort, delay)
      }
    })
  } catch {
    port = null
    setConnected(false)

    if (refCount > 0 && reconnectAttempt < 5) {
      const delay = Math.min(1000 * 2 ** reconnectAttempt++, 16000)
      reconnectTimer = setTimeout(connectPort, delay)
    }
  }
}

function acquirePort(): void {
  if (++refCount === 1) connectPort()
}

function releasePort(): void {
  if (--refCount <= 0) {
    refCount = 0
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = undefined }
    try { port?.disconnect() } catch { /* ignore */ }
    port = null
    setConnected(false)
  }
}

// ─── Hooks ───────────────────────────────────────────────────

/**
 * Subscribe to a specific message type pushed from background via port.
 *
 * Manages port lifecycle automatically:
 *   - Connects on first subscriber (ref-counted singleton)
 *   - Auto-reconnects on MV3 service worker sleep/wake
 *   - Disconnects when all subscribers unmount
 *
 * @param type - The ExtensionMessage type to listen for
 * @param handler - Callback receiving the message payload
 * @returns Whether the port is currently connected
 */
export function usePortSubscription(type: string, handler: MessageHandler): boolean {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const [connected, setConnectedState] = useState(_isConnected)

  // Manage port lifecycle (ref-counted)
  useEffect(() => {
    acquirePort()
    return releasePort
  }, [])

  // Track connection state changes
  useEffect(() => {
    const listener: ConnectionListener = (state) => setConnectedState(state)
    connectionListeners.add(listener)
    setConnectedState(_isConnected) // sync initial
    return () => { connectionListeners.delete(listener) }
  }, [])

  // Register message handler (stable ref to avoid re-subscribing)
  useEffect(() => {
    const stableHandler: MessageHandler = (payload) => handlerRef.current(payload)
    if (!messageHandlers.has(type)) messageHandlers.set(type, new Set())
    messageHandlers.get(type)!.add(stableHandler)
    return () => { messageHandlers.get(type)?.delete(stableHandler) }
  }, [type])

  return connected
}

/**
 * Establish port connection without subscribing to any message type.
 * Use at the App level to ensure the port stays alive while the side panel is open.
 *
 * @returns Whether the port is currently connected
 */
export function usePortConnection(): boolean {
  const [connected, setConnectedState] = useState(_isConnected)

  useEffect(() => {
    acquirePort()
    return releasePort
  }, [])

  useEffect(() => {
    const listener: ConnectionListener = (state) => setConnectedState(state)
    connectionListeners.add(listener)
    setConnectedState(_isConnected)
    return () => { connectionListeners.delete(listener) }
  }, [])

  return connected
}

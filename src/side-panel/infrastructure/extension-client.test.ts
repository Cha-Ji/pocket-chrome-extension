import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendRuntimeMessage,
  onRuntimeMessage,
  sendTabMessage,
  sendTabMessageSafe,
  sendTabMessageCallback,
} from './extension-client'

describe('extension-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── sendRuntimeMessage ──────────────────────────

  describe('sendRuntimeMessage', () => {
    it('sends a message without payload', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ isRunning: false })

      const result = await sendRuntimeMessage('GET_STATUS')

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_STATUS' })
      expect(result).toEqual({ isRunning: false })
    })

    it('sends a message with payload', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true })

      const result = await sendRuntimeMessage('SWITCH_ASSET', { assetName: 'EURUSD' })

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SWITCH_ASSET',
        payload: { assetName: 'EURUSD' },
      })
      expect(result).toEqual({ success: true })
    })

    it('propagates errors from chrome.runtime', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Extension context invalidated'))

      await expect(sendRuntimeMessage('GET_STATUS')).rejects.toThrow('Extension context invalidated')
    })
  })

  // ── onRuntimeMessage ────────────────────────────

  describe('onRuntimeMessage', () => {
    it('registers a listener and returns an unsubscribe function', () => {
      const listener = vi.fn()

      const unsubscribe = onRuntimeMessage(listener)

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener)

      unsubscribe()

      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener)
    })
  })

  // ── sendTabMessage ──────────────────────────────

  describe('sendTabMessage', () => {
    it('queries active tab and sends message', async () => {
      vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 42 }] as chrome.tabs.Tab[])
      vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({ initialized: true })

      const result = await sendTabMessage('GET_STATUS_V2')

      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { type: 'GET_STATUS_V2' })
      expect(result).toEqual({ initialized: true })
    })

    it('throws when no active tab', async () => {
      vi.mocked(chrome.tabs.query).mockResolvedValue([])

      await expect(sendTabMessage('GET_STATUS_V2')).rejects.toThrow('No active tab')
    })

    it('throws when tab has no id', async () => {
      vi.mocked(chrome.tabs.query).mockResolvedValue([{}] as chrome.tabs.Tab[])

      await expect(sendTabMessage('GET_STATUS_V2')).rejects.toThrow('No active tab')
    })
  })

  // ── sendTabMessageSafe ──────────────────────────

  describe('sendTabMessageSafe', () => {
    it('does not throw on failure', async () => {
      vi.mocked(chrome.tabs.query).mockResolvedValue([])

      // Should not throw
      await expect(sendTabMessageSafe('GET_STATUS_V2')).resolves.toBeUndefined()
    })
  })

  // ── sendTabMessageCallback ──────────────────────

  describe('sendTabMessageCallback', () => {
    it('queries tab and calls callback with response', () => {
      const callback = vi.fn()

      // Make chrome.tabs.query invoke callback immediately
      vi.mocked(chrome.tabs.query).mockImplementation((_query, cb) => {
        if (cb) cb([{ id: 99 }] as chrome.tabs.Tab[])
        return Promise.resolve([{ id: 99 }] as chrome.tabs.Tab[])
      })
      vi.mocked(chrome.tabs.sendMessage).mockImplementation((_tabId, _msg, cb) => {
        if (typeof cb === 'function') cb({ status: 'ok' })
        return Promise.resolve({ status: 'ok' })
      })

      sendTabMessageCallback('GET_MINER_STATUS', callback)

      expect(chrome.tabs.query).toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith({ status: 'ok' })
    })

    it('does not call callback when no active tab', () => {
      const callback = vi.fn()

      vi.mocked(chrome.tabs.query).mockImplementation((_query, cb) => {
        if (cb) cb([])
        return Promise.resolve([])
      })

      sendTabMessageCallback('GET_MINER_STATUS', callback)

      expect(callback).not.toHaveBeenCalled()
    })
  })
})

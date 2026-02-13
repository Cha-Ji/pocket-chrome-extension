/**
 * Extension Client — Chrome API abstraction for side-panel.
 *
 * All Chrome messaging (runtime / tabs) goes through this module.
 * Components and hooks import only from here, never from `chrome.*` directly.
 *
 * Benefits:
 *  - Single place to mock in tests (no scattered chrome stubs)
 *  - Consistent async/await surface (no callback-style chrome.tabs.query)
 *  - Typed message protocol via ExtensionMessage
 */

// ────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────

/** Callback for incoming messages; return a cleanup function. */
export type MessageListener = (message: { type: string; payload?: unknown }) => void

// ────────────────────────────────────────────────────
// Runtime messaging (side-panel ↔ background)
// ────────────────────────────────────────────────────

/**
 * Send a message to the background service worker via `chrome.runtime`.
 * Returns the response or `null` on failure.
 */
export async function sendRuntimeMessage(
  type: string,
  payload?: unknown,
): Promise<unknown> {
  const message = payload !== undefined ? { type, payload } : { type }
  return chrome.runtime.sendMessage(message)
}

/**
 * Subscribe to messages from the background (or relayed from content-script).
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function onRuntimeMessage(listener: MessageListener): () => void {
  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}

// ────────────────────────────────────────────────────
// Tab messaging (side-panel → content-script)
// ────────────────────────────────────────────────────

/** Resolve the active Pocket-Option tab id, or `null` if none. */
async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

/**
 * Send a message to the active tab's content-script via `chrome.tabs`.
 * Throws if no active tab is available.
 */
export async function sendTabMessage(
  type: string,
  payload?: unknown,
): Promise<unknown> {
  const tabId = await getActiveTabId()
  if (tabId == null) throw new Error('No active tab')

  const message = payload !== undefined ? { type, payload } : { type }
  return chrome.tabs.sendMessage(tabId, message)
}

/**
 * Fire-and-forget variant of `sendTabMessage`.
 * Silently swallows errors (useful for toggle/start/stop actions where
 * the caller doesn't need the response).
 */
export async function sendTabMessageSafe(
  type: string,
  payload?: unknown,
): Promise<void> {
  try {
    await sendTabMessage(type, payload)
  } catch {
    // intentionally swallowed
  }
}

/**
 * Send a tab message using the legacy callback pattern.
 * Used only for polling where callback style is more convenient
 * (e.g. inside setInterval with chrome.runtime.lastError check).
 */
export function sendTabMessageCallback(
  type: string,
  callback: (response: unknown) => void,
): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type }, (res) => {
        if (chrome.runtime.lastError) return
        callback(res)
      })
    }
  })
}

// ============================================================
// Content Script - Pocket Option Auto Trading V2
// Entry point: creates shared context, delegates to app/ modules.
// ============================================================

console.log('[PO] >>> SCRIPT LOADED <<<');

import { createContext } from './app/context'
import { initialize, setupTelegramStorageListener } from './app/bootstrap'
import { registerMessageListener } from './app/message-handler'
import { getSystemStatus as _getSystemStatus } from './app/message-handler'

const ctx = createContext()

registerMessageListener(ctx)
setupTelegramStorageListener(ctx)

function start(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(ctx))
  } else {
    initialize(ctx)
  }
}

start()

// Re-export with bound context for backward compat (no external consumers currently)
const getSystemStatus = () => _getSystemStatus(ctx)
export { getSystemStatus }

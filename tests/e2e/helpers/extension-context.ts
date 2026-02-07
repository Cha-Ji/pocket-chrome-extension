/**
 * Extension Context Helper
 * Playwright persistent context with Chrome extension loaded.
 *
 * Usage:
 *   const ctx = await launchWithExtension();
 *   // ... run tests
 *   await ctx.context.close();
 */

import { chromium, type BrowserContext } from '@playwright/test'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_EXTENSION_PATH = path.join(PROJECT_ROOT, 'dist')

export interface ExtensionContext {
  context: BrowserContext
  extensionId: string
}

export interface LaunchOptions {
  /** Path to the built extension (default: dist/) */
  extensionPath?: string
  /** Path to a pre-authenticated Chrome user data directory.
   *  Pass empty string for a fresh temp profile. */
  userDataDir?: string
  /** Extra Chrome launch args */
  extraArgs?: string[]
  /** Slow down operations by this many ms (useful for visual debugging) */
  slowMo?: number
  /** Viewport size */
  viewport?: { width: number; height: number }
}

/**
 * Launch a persistent Chromium context with the extension loaded.
 * Returns the context and resolved extension ID.
 */
export async function launchWithExtension(
  opts: LaunchOptions = {}
): Promise<ExtensionContext> {
  const extensionPath = opts.extensionPath ?? DEFAULT_EXTENSION_PATH
  const userDataDir = opts.userDataDir ?? ''

  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    ...(opts.extraArgs ?? []),
  ]

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args,
    slowMo: opts.slowMo,
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })

  // Resolve the extension ID from the service worker
  let background = context.serviceWorkers()[0]
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 10_000 })
  }
  const extensionId = background.url().split('/')[2]

  return { context, extensionId }
}

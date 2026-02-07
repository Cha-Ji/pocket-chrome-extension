
// ============================================================
// Selector Resolver - Multi-layer DOM fallback system
// ============================================================
// Uses platform selectors as the single source of truth.
// ============================================================

import {
  PO_DEMO_SELECTORS,
  PO_SELECTOR_FALLBACKS,
} from '../lib/platform/adapters/pocket-option/selectors'

export interface SelectorDefinition {
  primary: string
  fallbacks: string[]
  description?: string
}

export type RobustSelectors = Record<string, SelectorDefinition>

/**
 * Build robust selectors from platform selector definitions.
 * Primary = PO_DEMO_SELECTORS[key], Fallbacks = PO_SELECTOR_FALLBACKS[key].
 */
function buildRobustSelectors(): RobustSelectors {
  const result: RobustSelectors = {}
  const allKeys = new Set([
    ...Object.keys(PO_DEMO_SELECTORS),
    ...Object.keys(PO_SELECTOR_FALLBACKS),
  ])

  for (const key of allKeys) {
    const primary = PO_DEMO_SELECTORS[key] || PO_SELECTOR_FALLBACKS[key]?.[0] || ''
    const fallbacks = PO_SELECTOR_FALLBACKS[key] || []
    if (primary) {
      result[key] = { primary, fallbacks: fallbacks.filter(f => f !== primary) }
    }
  }

  return result
}

export const ROBUST_SELECTORS: RobustSelectors = buildRobustSelectors()

export class SelectorResolver {
  private cache: Map<string, string> = new Map()

  /**
   * Resolve an element using fallbacks and caching
   */
  async resolve(key: string): Promise<HTMLElement | null> {
    const def = ROBUST_SELECTORS[key]
    if (!def) return null

    // 1. Try cached success selector
    const cached = this.cache.get(key)
    if (cached) {
      const el = document.querySelector(cached) as HTMLElement
      if (el) return el
    }

    // 2. Try primary
    const primaryEl = document.querySelector(def.primary) as HTMLElement
    if (primaryEl) {
      this.cache.set(key, def.primary)
      return primaryEl
    }

    // 3. Try fallbacks
    console.warn(`[SelectorResolver] Primary for ${key} failed. Trying fallbacks...`)
    for (const fallback of def.fallbacks) {
      const el = document.querySelector(fallback) as HTMLElement
      if (el) {
        console.info(`[SelectorResolver] Found fallback for ${key}: ${fallback}`)
        this.cache.set(key, fallback)
        return el
      }
    }

    console.error(`[SelectorResolver] All selectors for ${key} failed.`)
    return null
  }

  /**
   * Clear cache if needed
   */
  clearCache() {
    this.cache.clear()
  }
}

let resolverInstance: SelectorResolver | null = null

export function getSelectorResolver(): SelectorResolver {
  if (!resolverInstance) {
    resolverInstance = new SelectorResolver()
  }
  return resolverInstance
}

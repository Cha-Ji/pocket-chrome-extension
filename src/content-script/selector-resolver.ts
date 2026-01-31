
// ============================================================
// Selector Resolver - Multi-layer DOM fallback system
// ============================================================

export interface SelectorDefinition {
  primary: string
  fallbacks: string[]
  description?: string
}

export type RobustSelectors = Record<string, SelectorDefinition>

export const ROBUST_SELECTORS: RobustSelectors = {
  callButton: {
    primary: '.switch-state-block__item:first-child',
    fallbacks: [
      '.btn-call',
      'button:contains("Higher")',
      '.trading-panel__buttons-item--up'
    ]
  },
  putButton: {
    primary: '.switch-state-block__item:last-child',
    fallbacks: [
      '.btn-put',
      'button:contains("Lower")',
      '.trading-panel__buttons-item--down'
    ]
  },
  priceDisplay: {
    primary: '.chart-item .value__val',
    fallbacks: [
      '.chart-block__price .value',
      '.current-price',
      '[data-test="current-price"]'
    ]
  },
  balanceDisplay: {
    primary: '.balance-info-block__value',
    fallbacks: [
      '.user-balance',
      '.header__balance-value'
    ]
  }
}

export class SelectorResolver {
  private cache: Map<string, string> = new Map()

  /**
   * Resolve an element using fallbacks and caching
   */
  async resolve(key: keyof RobustSelectors): Promise<HTMLElement | null> {
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

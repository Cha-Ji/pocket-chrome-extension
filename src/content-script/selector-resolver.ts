
// ============================================================
// Selector Resolver - Multi-layer DOM fallback system
// ============================================================
// Uses platform selectors as the single source of truth.
// TTL 기반 캐시 무효화 + DOM 존재 검증으로 stale 캐시 방지.
// ============================================================

import {
  PO_DEMO_SELECTORS,
  PO_SELECTOR_FALLBACKS,
} from '../lib/platform/adapters/pocket-option/selectors'
import { createLogger } from '../lib/logger'

const logger = createLogger('SelectorResolver')

/** 캐시 엔트리: 셀렉터 문자열 + 캐시 생성 시각 */
export interface CacheEntry {
  selector: string
  cachedAt: number
}

/** 캐시 기본 TTL (밀리초) - 30초 */
export const DEFAULT_CACHE_TTL_MS = 30_000

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
  private cache: Map<string, CacheEntry> = new Map()
  private cacheTtlMs: number

  // 캐시 통계 (디버깅용)
  private stats = { hits: 0, misses: 0, invalidations: 0 }

  constructor(cacheTtlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.cacheTtlMs = cacheTtlMs
  }

  /**
   * 캐시 엔트리가 유효한지 확인
   * - TTL 초과 여부 확인
   * - 캐시된 셀렉터로 DOM 요소가 여전히 존재하는지 확인
   */
  private isCacheValid(key: string, entry: CacheEntry): boolean {
    const now = Date.now()

    // TTL 초과 확인
    if (now - entry.cachedAt > this.cacheTtlMs) {
      logger.debug(
        `캐시 TTL 만료: ${key} (${Math.round((now - entry.cachedAt) / 1000)}초 경과)`,
      )
      this.stats.invalidations++
      return false
    }

    // DOM 존재 여부 확인
    const el = document.querySelector(entry.selector)
    if (!el) {
      logger.debug(
        `캐시된 요소 DOM에서 제거됨: ${key} (selector: ${entry.selector})`,
      )
      this.stats.invalidations++
      return false
    }

    return true
  }

  /**
   * Resolve an element using fallbacks and caching
   */
  async resolve(key: string): Promise<HTMLElement | null> {
    const def = ROBUST_SELECTORS[key]
    if (!def) return null

    // 1. 캐시 확인 (TTL + DOM 존재 검증)
    const cached = this.cache.get(key)
    if (cached && this.isCacheValid(key, cached)) {
      const el = document.querySelector(cached.selector) as HTMLElement
      if (el) {
        this.stats.hits++
        return el
      }
    }

    // 캐시 미스 또는 무효화된 경우 캐시 제거
    if (cached) {
      this.cache.delete(key)
    }
    this.stats.misses++

    // 2. primary 셀렉터 시도
    const primaryEl = document.querySelector(def.primary) as HTMLElement
    if (primaryEl) {
      this.cache.set(key, { selector: def.primary, cachedAt: Date.now() })
      logger.debug(`Primary 셀렉터 적중: ${key} -> ${def.primary}`)
      return primaryEl
    }

    // 3. fallback 셀렉터 순회
    logger.warn(`Primary 셀렉터 실패: ${key}. Fallback 시도 중...`)
    for (const fallback of def.fallbacks) {
      const el = document.querySelector(fallback) as HTMLElement
      if (el) {
        logger.info(`Fallback 셀렉터 적중: ${key} -> ${fallback}`)
        this.cache.set(key, { selector: fallback, cachedAt: Date.now() })
        return el
      }
    }

    logger.error(
      `모든 셀렉터 실패: ${key} (primary: ${def.primary}, fallbacks: ${def.fallbacks.length}개)`,
    )
    return null
  }

  /**
   * 캐시 전체 초기화
   */
  clearCache(): void {
    const size = this.cache.size
    this.cache.clear()
    if (size > 0) {
      logger.info(`캐시 전체 초기화 (${size}개 엔트리 제거)`)
    }
  }

  /**
   * 특정 키의 캐시만 무효화
   */
  invalidate(key: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
      this.stats.invalidations++
      logger.debug(`캐시 수동 무효화: ${key}`)
    }
  }

  /**
   * 만료된 캐시 엔트리 정리
   */
  pruneExpired(): number {
    const now = Date.now()
    let pruned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > this.cacheTtlMs) {
        this.cache.delete(key)
        pruned++
      }
    }

    if (pruned > 0) {
      logger.debug(`만료 캐시 정리: ${pruned}개 제거`)
    }
    return pruned
  }

  /**
   * 캐시 통계 반환 (디버깅용)
   */
  getStats(): { hits: number; misses: number; invalidations: number; size: number } {
    return { ...this.stats, size: this.cache.size }
  }

  /**
   * 캐시 통계 초기화
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, invalidations: 0 }
  }

  /**
   * 현재 캐시 TTL 반환 (밀리초)
   */
  getCacheTtlMs(): number {
    return this.cacheTtlMs
  }

  /**
   * 캐시 TTL 동적 변경
   */
  setCacheTtlMs(ttlMs: number): void {
    this.cacheTtlMs = ttlMs
    logger.info(`캐시 TTL 변경: ${ttlMs}ms`)
  }
}

let resolverInstance: SelectorResolver | null = null

export function getSelectorResolver(): SelectorResolver {
  if (!resolverInstance) {
    resolverInstance = new SelectorResolver()
  }
  return resolverInstance
}

/** 테스트용: 싱글톤 리셋 */
export function resetSelectorResolver(): void {
  resolverInstance = null
}

// ============================================================
// Strategy RAG (Retrieval Augmented Generation) Module
// ============================================================
// Stores and retrieves trading strategy knowledge
// Supports YouTube transcripts, documents, and custom strategies
// ============================================================

export interface StrategyDocument {
  id: string
  title: string
  source: 'youtube' | 'document' | 'manual'
  sourceUrl?: string
  content: string
  summary?: string
  indicators: string[]
  timeframe?: string
  conditions: StrategyCondition[]
  backtestResults?: BacktestSummary
  createdAt: number
  updatedAt: number
}

export interface StrategyCondition {
  type: 'entry' | 'exit'
  direction: 'CALL' | 'PUT' | 'both'
  description: string
  indicators: {
    name: string
    condition: string // e.g., "RSI < 30", "BB touch lower"
    value?: number
  }[]
}

export interface BacktestSummary {
  winRate: number
  profitFactor: number
  totalTrades: number
  netProfit: number
  dateRange: { start: number; end: number }
}

export interface SearchResult {
  document: StrategyDocument
  relevanceScore: number
  matchedTerms: string[]
}

// In-memory storage (will be persisted to IndexedDB)
const strategyStore: Map<string, StrategyDocument> = new Map()

/**
 * Add a new strategy document
 */
export function addStrategy(doc: Omit<StrategyDocument, 'id' | 'createdAt' | 'updatedAt'>): StrategyDocument {
  const id = generateId()
  const now = Date.now()
  
  const document: StrategyDocument = {
    ...doc,
    id,
    createdAt: now,
    updatedAt: now,
  }
  
  strategyStore.set(id, document)
  console.log(`[StrategyRAG] Added strategy: ${document.title}`)
  
  return document
}

/**
 * Update an existing strategy
 */
export function updateStrategy(id: string, updates: Partial<StrategyDocument>): StrategyDocument | null {
  const existing = strategyStore.get(id)
  if (!existing) return null
  
  const updated = {
    ...existing,
    ...updates,
    id, // Preserve ID
    createdAt: existing.createdAt, // Preserve creation time
    updatedAt: Date.now(),
  }
  
  strategyStore.set(id, updated)
  return updated
}

/**
 * Get a strategy by ID
 */
export function getStrategy(id: string): StrategyDocument | null {
  return strategyStore.get(id) || null
}

/**
 * Get all strategies
 */
export function getAllStrategies(): StrategyDocument[] {
  return Array.from(strategyStore.values())
}

/**
 * Search strategies by keyword
 */
export function searchStrategies(query: string): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/)
  const results: SearchResult[] = []
  
  for (const doc of strategyStore.values()) {
    const searchText = [
      doc.title,
      doc.content,
      doc.summary || '',
      ...doc.indicators,
      ...doc.conditions.map(c => c.description),
    ].join(' ').toLowerCase()
    
    const matchedTerms = terms.filter(term => searchText.includes(term))
    
    if (matchedTerms.length > 0) {
      const relevanceScore = matchedTerms.length / terms.length
      results.push({ document: doc, relevanceScore, matchedTerms })
    }
  }
  
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore)
}

/**
 * Search strategies by indicator
 */
export function searchByIndicator(indicator: string): StrategyDocument[] {
  const normalizedIndicator = indicator.toLowerCase()
  return getAllStrategies().filter(doc =>
    doc.indicators.some(i => i.toLowerCase().includes(normalizedIndicator))
  )
}

/**
 * Delete a strategy
 */
export function deleteStrategy(id: string): boolean {
  return strategyStore.delete(id)
}

/**
 * Parse YouTube transcript into strategy document
 * This is a placeholder - actual implementation would use YouTube API
 */
export async function parseYouTubeStrategy(videoUrl: string): Promise<Partial<StrategyDocument>> {
  // Extract video ID
  const videoIdMatch = videoUrl.match(/(?:v=|\/)([\w-]{11})/)
  const videoId = videoIdMatch ? videoIdMatch[1] : null
  
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }
  
  // TODO: Implement actual YouTube transcript extraction
  // Options:
  // 1. youtube-transcript-api (npm package)
  // 2. youtube-dl with subtitle extraction
  // 3. Manual transcript paste
  
  return {
    source: 'youtube',
    sourceUrl: videoUrl,
    title: `YouTube Strategy ${videoId}`,
    content: '[Transcript will be extracted here]',
    indicators: [],
    conditions: [],
  }
}

/**
 * Extract strategy conditions from text using pattern matching
 */
export function extractConditionsFromText(text: string): StrategyCondition[] {
  const conditions: StrategyCondition[] = []
  
  // Common patterns for binary options strategies
  const patterns = [
    // RSI patterns
    { regex: /RSI.*?(?:below|under|<)\s*(\d+)/gi, indicator: 'RSI', direction: 'CALL' as const },
    { regex: /RSI.*?(?:above|over|>)\s*(\d+)/gi, indicator: 'RSI', direction: 'PUT' as const },
    
    // Bollinger Bands
    { regex: /(?:price|candle).*?(?:touch|hit|reach).*?lower\s*(?:BB|bollinger)/gi, indicator: 'BB', direction: 'CALL' as const },
    { regex: /(?:price|candle).*?(?:touch|hit|reach).*?upper\s*(?:BB|bollinger)/gi, indicator: 'BB', direction: 'PUT' as const },
    
    // Stochastic
    { regex: /stochastic.*?(?:below|under|<)\s*(\d+)/gi, indicator: 'Stochastic', direction: 'CALL' as const },
    { regex: /stochastic.*?(?:above|over|>)\s*(\d+)/gi, indicator: 'Stochastic', direction: 'PUT' as const },
    
    // MACD
    { regex: /MACD.*?cross.*?(?:above|up)/gi, indicator: 'MACD', direction: 'CALL' as const },
    { regex: /MACD.*?cross.*?(?:below|down)/gi, indicator: 'MACD', direction: 'PUT' as const },
  ]
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern.regex)
    for (const match of matches) {
      conditions.push({
        type: 'entry',
        direction: pattern.direction,
        description: match[0],
        indicators: [{
          name: pattern.indicator,
          condition: match[0],
          value: match[1] ? parseInt(match[1]) : undefined,
        }],
      })
    }
  }
  
  return conditions
}

/**
 * Export all strategies to JSON
 */
export function exportStrategies(): string {
  return JSON.stringify(getAllStrategies(), null, 2)
}

/**
 * Import strategies from JSON
 */
export function importStrategies(json: string): number {
  try {
    const strategies = JSON.parse(json) as StrategyDocument[]
    let count = 0
    
    for (const strategy of strategies) {
      if (strategy.id && strategy.title && strategy.content) {
        strategyStore.set(strategy.id, strategy)
        count++
      }
    }
    
    return count
  } catch (error) {
    console.error('[StrategyRAG] Import error:', error)
    return 0
  }
}

// Utility functions
function generateId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Pre-populate with some well-known strategies
export function initializeDefaultStrategies(): void {
  // RSI Reversal Strategy
  addStrategy({
    title: 'RSI 과매수/과매도 반전',
    source: 'manual',
    content: `
RSI(Relative Strength Index)를 사용한 기본 반전 전략.

진입 조건:
- CALL: RSI가 30 아래에서 30 위로 교차할 때
- PUT: RSI가 70 위에서 70 아래로 교차할 때

최적 설정:
- RSI 기간: 14
- 과매도 레벨: 30
- 과매수 레벨: 70
- 만료 시간: 1분 ~ 5분

주의사항:
- 강한 추세장에서는 역추세 신호 무시
- 횡보장에서 가장 효과적
    `.trim(),
    indicators: ['RSI'],
    timeframe: '1m-5m',
    conditions: [
      {
        type: 'entry',
        direction: 'CALL',
        description: 'RSI가 30 아래에서 30 위로 교차',
        indicators: [{ name: 'RSI', condition: 'cross above 30' }],
      },
      {
        type: 'entry',
        direction: 'PUT',
        description: 'RSI가 70 위에서 70 아래로 교차',
        indicators: [{ name: 'RSI', condition: 'cross below 70' }],
      },
    ],
  })

  // RSI + Bollinger Bands
  addStrategy({
    title: 'RSI + 볼린저 밴드 콤보',
    source: 'manual',
    content: `
RSI와 볼린저 밴드를 결합한 고확률 반전 전략.

진입 조건:
- CALL: RSI < 30 AND 가격이 하단 밴드 터치
- PUT: RSI > 70 AND 가격이 상단 밴드 터치

설정:
- RSI: 14
- BB: 20, 2.0 표준편차

이 전략은 두 지표가 동시에 극단값을 보일 때만 진입하므로
신호는 적지만 승률이 높음.
    `.trim(),
    indicators: ['RSI', 'Bollinger Bands'],
    timeframe: '1m-5m',
    conditions: [
      {
        type: 'entry',
        direction: 'CALL',
        description: 'RSI 과매도 + 하단 BB 터치',
        indicators: [
          { name: 'RSI', condition: '< 30' },
          { name: 'BB', condition: 'touch lower band' },
        ],
      },
      {
        type: 'entry',
        direction: 'PUT',
        description: 'RSI 과매수 + 상단 BB 터치',
        indicators: [
          { name: 'RSI', condition: '> 70' },
          { name: 'BB', condition: 'touch upper band' },
        ],
      },
    ],
  })

  console.log('[StrategyRAG] Initialized with default strategies')
}

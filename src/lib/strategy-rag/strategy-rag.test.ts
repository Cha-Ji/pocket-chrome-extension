import { describe, it, expect, beforeEach } from 'vitest'
import {
  addStrategy,
  updateStrategy,
  getStrategy,
  getAllStrategies,
  searchStrategies,
  searchByIndicator,
  deleteStrategy,
  parseYouTubeStrategy,
  extractConditionsFromText,
  exportStrategies,
  importStrategies,
  initializeDefaultStrategies,
} from './index'

// strategy store is module-level state - we need to clean between tests
function clearAllStrategies() {
  for (const s of getAllStrategies()) {
    deleteStrategy(s.id)
  }
}

describe('Strategy RAG', () => {
  beforeEach(() => {
    clearAllStrategies()
  })

  // ============================================================
  // CRUD Operations
  // ============================================================
  describe('addStrategy', () => {
    it('전략을 추가하고 ID를 생성한다', () => {
      const doc = addStrategy({
        title: 'Test Strategy',
        source: 'manual',
        content: 'RSI below 30 then buy',
        indicators: ['RSI'],
        conditions: [],
      })

      expect(doc.id).toMatch(/^strat_/)
      expect(doc.title).toBe('Test Strategy')
      expect(doc.createdAt).toBeGreaterThan(0)
      expect(doc.updatedAt).toBeGreaterThan(0)
    })

    it('추가된 전략을 getStrategy로 조회할 수 있다', () => {
      const doc = addStrategy({
        title: 'Fetch Test',
        source: 'manual',
        content: 'content',
        indicators: [],
        conditions: [],
      })

      const fetched = getStrategy(doc.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.title).toBe('Fetch Test')
    })
  })

  describe('updateStrategy', () => {
    it('기존 전략을 업데이트한다', () => {
      const doc = addStrategy({
        title: 'Original',
        source: 'manual',
        content: 'original content',
        indicators: [],
        conditions: [],
      })

      const updated = updateStrategy(doc.id, { title: 'Updated' })
      expect(updated).not.toBeNull()
      expect(updated!.title).toBe('Updated')
      expect(updated!.content).toBe('original content') // unchanged
      expect(updated!.id).toBe(doc.id) // ID preserved
      expect(updated!.createdAt).toBe(doc.createdAt) // creation time preserved
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(doc.updatedAt) // updated
    })

    it('존재하지 않는 ID는 null을 반환한다', () => {
      const result = updateStrategy('nonexistent', { title: 'X' })
      expect(result).toBeNull()
    })
  })

  describe('getStrategy', () => {
    it('존재하지 않는 ID는 null', () => {
      expect(getStrategy('nope')).toBeNull()
    })
  })

  describe('getAllStrategies', () => {
    it('모든 전략을 배열로 반환한다', () => {
      addStrategy({ title: 'A', source: 'manual', content: 'a', indicators: [], conditions: [] })
      addStrategy({ title: 'B', source: 'manual', content: 'b', indicators: [], conditions: [] })

      const all = getAllStrategies()
      expect(all).toHaveLength(2)
    })

    it('비어있으면 빈 배열', () => {
      expect(getAllStrategies()).toHaveLength(0)
    })
  })

  describe('deleteStrategy', () => {
    it('전략을 삭제한다', () => {
      const doc = addStrategy({ title: 'Del', source: 'manual', content: 'x', indicators: [], conditions: [] })
      expect(deleteStrategy(doc.id)).toBe(true)
      expect(getStrategy(doc.id)).toBeNull()
    })

    it('존재하지 않는 ID는 false', () => {
      expect(deleteStrategy('nope')).toBe(false)
    })
  })

  // ============================================================
  // Search
  // ============================================================
  describe('searchStrategies', () => {
    beforeEach(() => {
      addStrategy({
        title: 'RSI Reversal',
        source: 'manual',
        content: 'When RSI is below 30, buy. When RSI is above 70, sell.',
        indicators: ['RSI'],
        conditions: [{ type: 'entry', direction: 'CALL', description: 'RSI oversold', indicators: [] }],
      })
      addStrategy({
        title: 'MACD Crossover',
        source: 'manual',
        content: 'MACD line crosses above signal line. Trend following.',
        indicators: ['MACD'],
        conditions: [{ type: 'entry', direction: 'CALL', description: 'MACD cross up', indicators: [] }],
      })
      addStrategy({
        title: 'RSI + BB Combo',
        source: 'manual',
        content: 'RSI below 30 and price touches lower Bollinger Band.',
        indicators: ['RSI', 'Bollinger Bands'],
        conditions: [],
      })
    })

    it('키워드로 검색한다', () => {
      const results = searchStrategies('RSI')
      expect(results.length).toBe(2) // RSI Reversal + RSI + BB Combo
    })

    it('relevance 점수로 정렬한다', () => {
      const results = searchStrategies('RSI below')
      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(results[results.length - 1].relevanceScore)
    })

    it('매칭되는 term을 반환한다', () => {
      const results = searchStrategies('RSI oversold')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedTerms).toContain('rsi')
    })

    it('매칭이 없으면 빈 배열', () => {
      const results = searchStrategies('nonexistent_term_xyz')
      expect(results).toHaveLength(0)
    })

    it('빈 쿼리도 결과를 반환한다 (빈 문자열은 모든 텍스트에 포함)', () => {
      // ''.split(/\s+/) => [''], and ''.includes('') is true for any string
      const results = searchStrategies('')
      expect(results).toHaveLength(3)
      expect(results[0].relevanceScore).toBe(1)
    })
  })

  describe('searchByIndicator', () => {
    beforeEach(() => {
      addStrategy({
        title: 'RSI Strategy',
        source: 'manual',
        content: 'uses RSI',
        indicators: ['RSI'],
        conditions: [],
      })
      addStrategy({
        title: 'BB Strategy',
        source: 'manual',
        content: 'uses BB',
        indicators: ['Bollinger Bands'],
        conditions: [],
      })
    })

    it('인디케이터로 검색한다', () => {
      const results = searchByIndicator('RSI')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('RSI Strategy')
    })

    it('대소문자 무관 검색', () => {
      const results = searchByIndicator('rsi')
      expect(results).toHaveLength(1)
    })

    it('부분 일치도 가능하다', () => {
      const results = searchByIndicator('Bollinger')
      expect(results).toHaveLength(1)
    })

    it('매칭이 없으면 빈 배열', () => {
      const results = searchByIndicator('ATR')
      expect(results).toHaveLength(0)
    })
  })

  // ============================================================
  // Import / Export
  // ============================================================
  describe('export / import', () => {
    it('전략을 JSON으로 내보내고 가져온다', () => {
      addStrategy({ title: 'Exported', source: 'manual', content: 'content', indicators: ['RSI'], conditions: [] })

      const json = exportStrategies()
      const parsed = JSON.parse(json)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].title).toBe('Exported')

      clearAllStrategies()
      expect(getAllStrategies()).toHaveLength(0)

      const count = importStrategies(json)
      expect(count).toBe(1)
      expect(getAllStrategies()).toHaveLength(1)
    })

    it('유효하지 않은 JSON은 0을 반환한다', () => {
      const count = importStrategies('not json')
      expect(count).toBe(0)
    })

    it('필수 필드가 없는 항목은 무시한다', () => {
      const json = JSON.stringify([
        { id: '1', title: 'Good', content: 'c' },
        { id: '2' }, // title과 content 없음
      ])
      const count = importStrategies(json)
      expect(count).toBe(1)
    })
  })

  // ============================================================
  // extractConditionsFromText
  // ============================================================
  describe('extractConditionsFromText', () => {
    it('RSI below 조건을 추출한다', () => {
      const conditions = extractConditionsFromText('When RSI is below 30, buy call')
      expect(conditions.length).toBeGreaterThan(0)
      expect(conditions[0].direction).toBe('CALL')
      expect(conditions[0].indicators[0].name).toBe('RSI')
      expect(conditions[0].indicators[0].value).toBe(30)
    })

    it('RSI above 조건을 추출한다', () => {
      const conditions = extractConditionsFromText('RSI above 70 then sell put')
      expect(conditions.length).toBeGreaterThan(0)
      expect(conditions[0].direction).toBe('PUT')
    })

    it('Bollinger Band 조건을 추출한다', () => {
      const conditions = extractConditionsFromText('price touch lower BB')
      expect(conditions.length).toBeGreaterThan(0)
      expect(conditions[0].indicators[0].name).toBe('BB')
      expect(conditions[0].direction).toBe('CALL')
    })

    it('Stochastic 조건을 추출한다', () => {
      const conditions = extractConditionsFromText('Stochastic below 20')
      expect(conditions.length).toBeGreaterThan(0)
      expect(conditions[0].indicators[0].name).toBe('Stochastic')
      expect(conditions[0].direction).toBe('CALL')
    })

    it('MACD cross 조건을 추출한다', () => {
      const conditions = extractConditionsFromText('MACD cross above signal')
      expect(conditions.length).toBeGreaterThan(0)
      expect(conditions[0].indicators[0].name).toBe('MACD')
      expect(conditions[0].direction).toBe('CALL')
    })

    it('조건이 없는 텍스트는 빈 배열', () => {
      const conditions = extractConditionsFromText('This is a random text without indicators')
      expect(conditions).toHaveLength(0)
    })

    it('여러 조건을 동시에 추출한다', () => {
      const text = 'RSI below 30 and Stochastic below 20, also MACD cross above signal'
      const conditions = extractConditionsFromText(text)
      expect(conditions.length).toBeGreaterThanOrEqual(3)
    })
  })

  // ============================================================
  // parseYouTubeStrategy
  // ============================================================
  describe('parseYouTubeStrategy', () => {
    it('유효한 YouTube URL에서 비디오 ID를 추출한다', async () => {
      const result = await parseYouTubeStrategy('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result.source).toBe('youtube')
      expect(result.sourceUrl).toContain('dQw4w9WgXcQ')
      expect(result.title).toContain('dQw4w9WgXcQ')
    })

    it('유효하지 않은 URL은 에러를 던진다', async () => {
      await expect(parseYouTubeStrategy('https://example.com')).rejects.toThrow('Invalid YouTube URL')
    })
  })

  // ============================================================
  // initializeDefaultStrategies
  // ============================================================
  describe('initializeDefaultStrategies', () => {
    it('기본 전략들을 초기화한다', () => {
      initializeDefaultStrategies()
      const all = getAllStrategies()
      expect(all.length).toBeGreaterThanOrEqual(2)
      expect(all.some(s => s.indicators.includes('RSI'))).toBe(true)
    })
  })
})

// ============================================================
// Indicator Reader - DOM에서 인디케이터 값 읽기
// ============================================================
// Pocket Option 페이지에 표시되는 RSI, Stochastic 등 인디케이터 값을
// DOM에서 직접 읽어오는 모듈
// ============================================================

export interface IndicatorValues {
  rsi?: number
  stochasticK?: number
  stochasticD?: number
  macd?: {
    macd: number
    signal: number
    histogram: number
  }
  bollingerBands?: {
    upper: number
    middle: number
    lower: number
  }
  timestamp: number
}

// Pocket Option 인디케이터 DOM 셀렉터
// 실제 사이트 구조에 따라 조정 필요
const INDICATOR_SELECTORS = {
  // RSI 관련 셀렉터 (여러 패턴 시도)
  rsi: [
    '.indicator-rsi .value',
    '.rsi-value',
    '[data-indicator="rsi"]',
    '.indicators .rsi',
    '.chart-indicator--rsi .indicator-value',
    // 인디케이터 패널 영역
    '.indicators-panel .rsi',
    '.indicator-panel [data-name="RSI"]',
  ],

  // Stochastic 셀렉터
  stochastic: [
    '.indicator-stochastic .value',
    '.stoch-value',
    '[data-indicator="stochastic"]',
    '.indicators .stochastic',
    '.chart-indicator--stochastic .indicator-value',
    '.indicator-panel [data-name="Stochastic"]',
  ],

  // Stochastic K/D 라인 개별 셀렉터
  stochasticK: [
    '.stochastic-k',
    '.stoch-k-value',
    '[data-line="k"]',
  ],
  stochasticD: [
    '.stochastic-d',
    '.stoch-d-value',
    '[data-line="d"]',
  ],

  // MACD 셀렉터
  macd: [
    '.indicator-macd .value',
    '.macd-value',
    '[data-indicator="macd"]',
    '.chart-indicator--macd .indicator-value',
  ],

  // 볼린저 밴드 셀렉터
  bollingerBands: [
    '.indicator-bb .value',
    '.bb-value',
    '[data-indicator="bollinger"]',
    '.chart-indicator--bb .indicator-value',
  ],

  // 일반적인 인디케이터 컨테이너
  indicatorContainer: [
    '.indicators',
    '.chart-indicators',
    '.indicator-panel',
    '.indicators-block',
    '.chart-bottom-panel',
  ],
}

export class IndicatorReader {
  private observer: MutationObserver | null = null
  private pollingInterval: ReturnType<typeof setInterval> | null = null
  private _isReading = false
  private lastValues: IndicatorValues | null = null
  private listeners: ((values: IndicatorValues) => void)[] = []

  get isReading(): boolean {
    return this._isReading
  }

  /**
   * Start reading indicator values
   */
  start(): void {
    if (this._isReading) return

    console.log('[PO] [IndicatorReader] Starting indicator reading...')
    this._isReading = true

    // MutationObserver로 인디케이터 변화 감지
    this.setupObserver()

    // 폴링 백업 (1초마다)
    this.startPolling()

    console.log('[PO] [IndicatorReader] Reading started')
  }

  /**
   * Stop reading
   */
  stop(): void {
    if (!this._isReading) return

    console.log('[PO] [IndicatorReader] Stopping indicator reading...')

    this.observer?.disconnect()
    this.observer = null

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    this._isReading = false
    console.log('[PO] [IndicatorReader] Reading stopped')
  }

  /**
   * Get current indicator values
   */
  getValues(): IndicatorValues | null {
    return this.lastValues
  }

  /**
   * Get RSI value
   */
  getRSI(): number | null {
    return this.lastValues?.rsi ?? null
  }

  /**
   * Get Stochastic values
   */
  getStochastic(): { k: number; d: number } | null {
    if (this.lastValues?.stochasticK !== undefined &&
        this.lastValues?.stochasticD !== undefined) {
      return {
        k: this.lastValues.stochasticK,
        d: this.lastValues.stochasticD
      }
    }
    return null
  }

  /**
   * Subscribe to indicator updates
   */
  onUpdate(callback: (values: IndicatorValues) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  /**
   * Force read current values
   */
  readNow(): IndicatorValues {
    return this.readAllIndicators()
  }

  // ============================================================
  // DOM Reading
  // ============================================================

  /**
   * Read all indicator values from DOM
   */
  private readAllIndicators(): IndicatorValues {
    const values: IndicatorValues = {
      timestamp: Date.now()
    }

    // RSI 읽기
    const rsi = this.readRSI()
    if (rsi !== null) {
      values.rsi = rsi
    }

    // Stochastic 읽기
    const stoch = this.readStochastic()
    if (stoch) {
      values.stochasticK = stoch.k
      values.stochasticD = stoch.d
    }

    // MACD 읽기
    const macd = this.readMACD()
    if (macd) {
      values.macd = macd
    }

    // 볼린저 밴드 읽기
    const bb = this.readBollingerBands()
    if (bb) {
      values.bollingerBands = bb
    }

    return values
  }

  /**
   * Read RSI value from DOM
   */
  private readRSI(): number | null {
    // 방법 1: 직접 셀렉터로 찾기
    for (const selector of INDICATOR_SELECTORS.rsi) {
      const el = document.querySelector(selector)
      if (el) {
        const value = this.parseNumber(el.textContent || '')
        if (value !== null && value >= 0 && value <= 100) {
          console.log(`[IndicatorReader] RSI found with selector "${selector}": ${value}`)
          return value
        }
      }
    }

    // 방법 2: 인디케이터 컨테이너에서 RSI 텍스트 패턴 찾기
    const rsiFromText = this.findIndicatorByPattern('RSI', 0, 100)
    if (rsiFromText !== null) {
      return rsiFromText
    }

    // 방법 3: 숫자만 있는 인디케이터 영역 탐색
    const rsiFromContainer = this.searchInIndicatorContainers('rsi', 0, 100)
    if (rsiFromContainer !== null) {
      return rsiFromContainer
    }

    return null
  }

  /**
   * Read Stochastic values from DOM
   */
  private readStochastic(): { k: number; d: number } | null {
    let k: number | null = null
    let d: number | null = null

    // K 라인 읽기
    for (const selector of INDICATOR_SELECTORS.stochasticK) {
      const el = document.querySelector(selector)
      if (el) {
        const value = this.parseNumber(el.textContent || '')
        if (value !== null && value >= 0 && value <= 100) {
          k = value
          break
        }
      }
    }

    // D 라인 읽기
    for (const selector of INDICATOR_SELECTORS.stochasticD) {
      const el = document.querySelector(selector)
      if (el) {
        const value = this.parseNumber(el.textContent || '')
        if (value !== null && value >= 0 && value <= 100) {
          d = value
          break
        }
      }
    }

    // 일반 Stochastic 셀렉터에서 K/D 추출 시도
    if (k === null || d === null) {
      for (const selector of INDICATOR_SELECTORS.stochastic) {
        const el = document.querySelector(selector)
        if (el) {
          const text = el.textContent || ''
          const parsed = this.parseStochasticText(text)
          if (parsed) {
            return parsed
          }
        }
      }
    }

    // 텍스트 패턴으로 찾기
    const stochFromText = this.findStochasticByPattern()
    if (stochFromText) {
      return stochFromText
    }

    if (k !== null && d !== null) {
      return { k, d }
    }

    return null
  }

  /**
   * Read MACD values from DOM
   */
  private readMACD(): { macd: number; signal: number; histogram: number } | null {
    for (const selector of INDICATOR_SELECTORS.macd) {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent || ''
        const parsed = this.parseMACDText(text)
        if (parsed) {
          return parsed
        }
      }
    }
    return null
  }

  /**
   * Read Bollinger Bands values from DOM
   */
  private readBollingerBands(): { upper: number; middle: number; lower: number } | null {
    for (const selector of INDICATOR_SELECTORS.bollingerBands) {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent || ''
        const parsed = this.parseBBText(text)
        if (parsed) {
          return parsed
        }
      }
    }
    return null
  }

  // ============================================================
  // Pattern Finding
  // ============================================================

  /**
   * Find indicator value by text pattern
   */
  private findIndicatorByPattern(name: string, min: number, max: number): number | null {
    // 모든 텍스트 노드에서 "RSI: 45.6" 또는 "RSI 45.6" 패턴 찾기
    const regex = new RegExp(`${name}[:\\s]*(\\d+\\.?\\d*)`, 'i')

    for (const selector of INDICATOR_SELECTORS.indicatorContainer) {
      const container = document.querySelector(selector)
      if (container) {
        const text = container.textContent || ''
        const match = text.match(regex)
        if (match && match[1]) {
          const value = parseFloat(match[1])
          if (!isNaN(value) && value >= min && value <= max) {
            console.log(`[IndicatorReader] Found ${name} by pattern: ${value}`)
            return value
          }
        }
      }
    }

    return null
  }

  /**
   * Find Stochastic by text pattern
   */
  private findStochasticByPattern(): { k: number; d: number } | null {
    // "K: 45.6 D: 32.1" 또는 "Stoch 45.6/32.1" 패턴
    const patterns = [
      /K[:\s]*(\d+\.?\d*)\s*D[:\s]*(\d+\.?\d*)/i,
      /Stoch[astic]*[:\s]*(\d+\.?\d*)\s*[\/,]\s*(\d+\.?\d*)/i,
      /(\d+\.?\d*)\s*[\/,]\s*(\d+\.?\d*)/,
    ]

    for (const selector of INDICATOR_SELECTORS.indicatorContainer) {
      const container = document.querySelector(selector)
      if (container) {
        const text = container.textContent || ''

        for (const pattern of patterns) {
          const match = text.match(pattern)
          if (match && match[1] && match[2]) {
            const k = parseFloat(match[1])
            const d = parseFloat(match[2])
            if (!isNaN(k) && !isNaN(d) &&
                k >= 0 && k <= 100 && d >= 0 && d <= 100) {
              console.log(`[IndicatorReader] Found Stochastic by pattern: K=${k}, D=${d}`)
              return { k, d }
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Search in indicator containers
   */
  private searchInIndicatorContainers(indicatorName: string, min: number, max: number): number | null {
    for (const selector of INDICATOR_SELECTORS.indicatorContainer) {
      const container = document.querySelector(selector)
      if (!container) continue

      // 인디케이터 이름을 포함하는 요소 찾기
      const elements = container.querySelectorAll('*')
      for (const el of elements) {
        const text = el.textContent?.toLowerCase() || ''
        if (text.includes(indicatorName.toLowerCase())) {
          // 근처 요소에서 숫자 찾기
          const numbers = text.match(/\d+\.?\d*/g)
          if (numbers) {
            for (const numStr of numbers) {
              const num = parseFloat(numStr)
              if (!isNaN(num) && num >= min && num <= max) {
                return num
              }
            }
          }
        }
      }
    }
    return null
  }

  // ============================================================
  // Parsing Helpers
  // ============================================================

  /**
   * Parse number from text
   */
  private parseNumber(text: string): number | null {
    const cleaned = text.replace(/[,\s]/g, '')
    const match = cleaned.match(/-?[\d.]+/)
    if (match) {
      const num = parseFloat(match[0])
      return isNaN(num) ? null : num
    }
    return null
  }

  /**
   * Parse Stochastic K/D from text
   */
  private parseStochasticText(text: string): { k: number; d: number } | null {
    // "45.6 / 32.1" 또는 "K: 45.6 D: 32.1" 형태
    const numbers = text.match(/-?\d+\.?\d*/g)
    if (numbers && numbers.length >= 2) {
      const k = parseFloat(numbers[0])
      const d = parseFloat(numbers[1])
      if (!isNaN(k) && !isNaN(d) && k >= 0 && k <= 100 && d >= 0 && d <= 100) {
        return { k, d }
      }
    }
    return null
  }

  /**
   * Parse MACD text
   */
  private parseMACDText(text: string): { macd: number; signal: number; histogram: number } | null {
    const numbers = text.match(/-?\d+\.?\d*/g)
    if (numbers && numbers.length >= 3) {
      return {
        macd: parseFloat(numbers[0]),
        signal: parseFloat(numbers[1]),
        histogram: parseFloat(numbers[2])
      }
    }
    return null
  }

  /**
   * Parse Bollinger Bands text
   */
  private parseBBText(text: string): { upper: number; middle: number; lower: number } | null {
    const numbers = text.match(/-?\d+\.?\d*/g)
    if (numbers && numbers.length >= 3) {
      const sorted = numbers.map(n => parseFloat(n)).sort((a, b) => b - a)
      return {
        upper: sorted[0],
        middle: sorted[1],
        lower: sorted[2]
      }
    }
    return null
  }

  // ============================================================
  // Observation
  // ============================================================

  /**
   * Setup MutationObserver
   */
  private setupObserver(): void {
    const targets: Element[] = []

    for (const selector of INDICATOR_SELECTORS.indicatorContainer) {
      const el = document.querySelector(selector)
      if (el) targets.push(el)
    }

    if (targets.length === 0) {
      console.warn('[IndicatorReader] No indicator containers found. Using polling only.')
      return
    }

    this.observer = new MutationObserver(() => {
      this.processUpdate()
    })

    targets.forEach(target => {
      this.observer!.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
      })
    })

    console.log(`[IndicatorReader] Observing ${targets.length} indicator containers`)
  }

  /**
   * Start polling
   */
  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.processUpdate()
    }, 1000) // 1초마다 폴링
  }

  /**
   * Process indicator update
   */
  private processUpdate(): void {
    const values = this.readAllIndicators()

    // 값이 변경되었는지 확인
    if (this.hasChanged(values)) {
      this.lastValues = values

      // 리스너에 알림
      this.listeners.forEach(l => l(values))

      // Background에 알림
      this.notifyBackground(values)
    }
  }

  /**
   * Check if values changed
   */
  private hasChanged(newValues: IndicatorValues): boolean {
    if (!this.lastValues) return true

    return (
      this.lastValues.rsi !== newValues.rsi ||
      this.lastValues.stochasticK !== newValues.stochasticK ||
      this.lastValues.stochasticD !== newValues.stochasticD
    )
  }

  /**
   * Notify background script
   */
  private notifyBackground(values: IndicatorValues): void {
    chrome.runtime.sendMessage({
      type: 'INDICATOR_VALUES',
      payload: values
    }).catch(() => {
      // Background script may not be ready
    })
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let readerInstance: IndicatorReader | null = null

export function getIndicatorReader(): IndicatorReader {
  if (!readerInstance) {
    readerInstance = new IndicatorReader()
  }
  return readerInstance
}

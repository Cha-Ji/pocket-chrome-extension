import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Logger, configureLogger, getLoggerConfig, createLogger, devTools } from './index'

describe('Logger', () => {
  let originalWindow: typeof globalThis.window

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Reset config to defaults
    configureLogger({
      level: 'debug', // allow all levels for testing
      enabledModules: '*',
      disabledModules: [],
      showTimestamp: false,
      showModule: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================
  // Basic logging
  // ============================================================
  describe('basic logging', () => {
    it('debug 메시지를 출력한다', () => {
      const logger = new Logger('Test')
      logger.debug('debug message')
      expect(console.debug).toHaveBeenCalled()
    })

    it('info 메시지를 출력한다', () => {
      const logger = new Logger('Test')
      logger.info('info message')
      expect(console.log).toHaveBeenCalled()
    })

    it('warn 메시지를 출력한다', () => {
      const logger = new Logger('Test')
      logger.warn('warn message')
      expect(console.warn).toHaveBeenCalled()
    })

    it('error 메시지를 출력한다', () => {
      const logger = new Logger('Test')
      logger.error('error message')
      expect(console.error).toHaveBeenCalled()
    })
  })

  // ============================================================
  // Log level filtering
  // ============================================================
  describe('log level filtering', () => {
    it('level이 info이면 debug를 필터링한다', () => {
      configureLogger({ level: 'info' })
      const logger = new Logger('Test')
      logger.debug('should be filtered')
      expect(console.debug).not.toHaveBeenCalled()
    })

    it('level이 warn이면 info와 debug를 필터링한다', () => {
      configureLogger({ level: 'warn' })
      const logger = new Logger('Test')
      logger.debug('filtered')
      logger.info('filtered')
      logger.warn('shown')
      expect(console.debug).not.toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalled()
    })

    it('level이 error이면 warn 이하를 필터링한다', () => {
      configureLogger({ level: 'error' })
      const logger = new Logger('Test')
      logger.debug('filtered')
      logger.info('filtered')
      logger.warn('filtered')
      logger.error('shown')
      expect(console.debug).not.toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })

    it('level이 none이면 모든 로그를 필터링한다', () => {
      configureLogger({ level: 'none' })
      const logger = new Logger('Test')
      logger.debug('filtered')
      logger.info('filtered')
      logger.warn('filtered')
      logger.error('filtered')
      expect(console.debug).not.toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // Module filtering
  // ============================================================
  describe('module filtering', () => {
    it('disabledModules에 포함된 모듈은 필터링한다', () => {
      configureLogger({ disabledModules: ['Muted'] })
      const logger = new Logger('Muted')
      logger.info('should be muted')
      expect(console.log).not.toHaveBeenCalled()
    })

    it('enabledModules가 배열이면 포함된 모듈만 출력한다', () => {
      configureLogger({ enabledModules: ['Allowed'] })

      const allowed = new Logger('Allowed')
      const blocked = new Logger('Blocked')

      allowed.info('shown')
      blocked.info('filtered')

      // console.log is called for configureLogger output + allowed.info
      // In jsdom (not window), the Node path is used
      expect(console.log).toHaveBeenCalledTimes(1)
    })

    it('enabledModules가 "*"이면 모든 모듈 출력', () => {
      configureLogger({ enabledModules: '*' })

      const a = new Logger('A')
      const b = new Logger('B')
      a.info('a')
      b.info('b')

      expect(console.log).toHaveBeenCalledTimes(2)
    })
  })

  // ============================================================
  // Convenience methods
  // ============================================================
  describe('convenience methods', () => {
    it('success는 info 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.success('done')
      expect(console.log).toHaveBeenCalled()
    })

    it('fail은 error 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.fail('failed')
      expect(console.error).toHaveBeenCalled()
    })

    it('start는 info 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.start('starting')
      expect(console.log).toHaveBeenCalled()
    })

    it('stop은 info 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.stop('stopping')
      expect(console.log).toHaveBeenCalled()
    })

    it('data는 debug 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.data('data point')
      expect(console.debug).toHaveBeenCalled()
    })

    it('signal은 info 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.signal('signal found')
      expect(console.log).toHaveBeenCalled()
    })

    it('trade는 info 레벨로 출력한다', () => {
      const logger = new Logger('Test')
      logger.trade('trade executed')
      expect(console.log).toHaveBeenCalled()
    })
  })

  // ============================================================
  // Config management
  // ============================================================
  describe('configureLogger / getLoggerConfig', () => {
    it('설정을 업데이트한다', () => {
      configureLogger({ level: 'warn', showTimestamp: true })
      const config = getLoggerConfig()
      expect(config.level).toBe('warn')
      expect(config.showTimestamp).toBe(true)
    })

    it('getLoggerConfig는 복사본을 반환한다', () => {
      const c1 = getLoggerConfig()
      const c2 = getLoggerConfig()
      expect(c1).not.toBe(c2)
      expect(c1).toEqual(c2)
    })
  })

  // ============================================================
  // createLogger
  // ============================================================
  describe('createLogger', () => {
    it('커스텀 모듈 이름으로 Logger를 생성한다', () => {
      const logger = createLogger('CustomModule')
      logger.info('test')
      expect(console.log).toHaveBeenCalled()
    })
  })

  // ============================================================
  // devTools
  // ============================================================
  describe('devTools', () => {
    it('enableDebug는 레벨을 debug로 설정한다', () => {
      devTools.enableDebug()
      expect(getLoggerConfig().level).toBe('debug')
    })

    it('quiet는 레벨을 error로 설정한다', () => {
      devTools.quiet()
      expect(getLoggerConfig().level).toBe('error')
    })

    it('reset은 기본 설정으로 되돌린다', () => {
      configureLogger({ level: 'none', showTimestamp: true })
      devTools.reset()
      const config = getLoggerConfig()
      expect(config.level).toBe('info')
      expect(config.showTimestamp).toBe(false)
    })

    it('mute는 모듈을 비활성화한다', () => {
      devTools.mute('WS', 'Miner')
      const config = getLoggerConfig()
      expect(config.disabledModules).toContain('WS')
      expect(config.disabledModules).toContain('Miner')
    })

    it('focus는 특정 모듈만 활성화한다', () => {
      devTools.focus('Signal')
      expect(getLoggerConfig().enabledModules).toEqual(['Signal'])
    })

    it('status는 설정을 출력한다', () => {
      vi.spyOn(console, 'table').mockImplementation(() => {})
      devTools.status()
      expect(console.table).toHaveBeenCalled()
    })
  })

  // ============================================================
  // Extra args
  // ============================================================
  describe('extra arguments', () => {
    it('추가 인자를 전달한다', () => {
      const logger = new Logger('Test')
      const extra = { key: 'value' }
      logger.info('msg', extra)
      // In jsdom (window defined), styled output: %c[PO]%c [Test], style1, style2, message, ...args
      // In Node (no window), plain output: [PO] [Test] message, ...args
      // Either way, console.log should be called with extra as one of the arguments
      expect(console.log).toHaveBeenCalled()
      const call = (console.log as any).mock.calls[0]
      expect(call).toContain(extra)
    })
  })
})

// ============================================================
// Pocket Quant Logger
// ============================================================
// Centralized logging with module prefixes and log levels
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

export interface LoggerConfig {
  level: LogLevel
  enabledModules: string[] | '*'  // '*' means all modules
  disabledModules: string[]
  showTimestamp: boolean
  showModule: boolean
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4
}


const MODULE_COLORS: Record<string, string> = {
  'WS': '#0ff',
  'Monitor': '#f0f',
  'Miner': '#ff0',
  'Collector': '#0f0',
  'DataSender': '#f80',
  'Executor': '#f00',
  'Signal': '#08f',
  'Parser': '#80f',
  'Background': '#888',
  'UI': '#4af'
}

// Default configuration
let globalConfig: LoggerConfig = {
  level: 'info',
  enabledModules: '*',
  disabledModules: [],
  showTimestamp: false,
  showModule: true
}

// Try to load config from localStorage (browser) or use defaults
function loadConfig(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('pq-logger-config')
      if (stored) {
        const parsed = JSON.parse(stored)
        globalConfig = { ...globalConfig, ...parsed }
      }
    } catch {
      // Ignore parsing errors
    }
  }
}

loadConfig()

export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('pq-logger-config', JSON.stringify(globalConfig))
    } catch {
      // Ignore storage errors
    }
  }
}

export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig }
}

function shouldLog(level: LogLevel, module: string): boolean {
  // Check level priority
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[globalConfig.level]) {
    return false
  }

  // Check if module is explicitly disabled
  if (globalConfig.disabledModules.includes(module)) {
    return false
  }

  // Check if module is enabled
  if (globalConfig.enabledModules === '*') {
    return true
  }

  return globalConfig.enabledModules.includes(module)
}

function formatMessage(_level: LogLevel, module: string, message: string): string {
  const parts: string[] = ['[PO]']

  if (globalConfig.showTimestamp) {
    const now = new Date()
    parts.push(`[${now.toLocaleTimeString()}]`)
  }

  if (globalConfig.showModule && module) {
    parts.push(`[${module}]`)
  }

  parts.push(message)
  return parts.join(' ')
}

export class Logger {
  private module: string

  constructor(module: string) {
    this.module = module
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!shouldLog(level, this.module)) return

    const formatted = formatMessage(level, this.module, message)
    const moduleColor = MODULE_COLORS[this.module] || '#aaa'

    // Use styled console output in browser
    if (typeof window !== 'undefined') {
      const prefix = `%c[PO]%c [${this.module}]`
      const styles = ['color: #0f0; font-weight: bold', `color: ${moduleColor}; font-weight: bold`]

      switch (level) {
        case 'debug':
          console.debug(prefix, ...styles, message, ...args)
          break
        case 'info':
          console.log(prefix, ...styles, message, ...args)
          break
        case 'warn':
          console.warn(prefix, ...styles, message, ...args)
          break
        case 'error':
          console.error(prefix, ...styles, message, ...args)
          break
      }
    } else {
      // Plain output for Node.js
      switch (level) {
        case 'debug':
          console.debug(formatted, ...args)
          break
        case 'info':
          console.log(formatted, ...args)
          break
        case 'warn':
          console.warn(formatted, ...args)
          break
        case 'error':
          console.error(formatted, ...args)
          break
      }
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args)
  }

  // Convenience methods with emojis
  success(message: string, ...args: any[]): void {
    this.log('info', `✅ ${message}`, ...args)
  }

  fail(message: string, ...args: any[]): void {
    this.log('error', `❌ ${message}`, ...args)
  }

  start(message: string, ...args: any[]): void {
    this.log('info', `🚀 ${message}`, ...args)
  }

  stop(message: string, ...args: any[]): void {
    this.log('info', `⏹ ${message}`, ...args)
  }

  data(message: string, ...args: any[]): void {
    this.log('debug', `📦 ${message}`, ...args)
  }

  signal(message: string, ...args: any[]): void {
    this.log('info', `🎯 ${message}`, ...args)
  }

  trade(message: string, ...args: any[]): void {
    this.log('info', `💰 ${message}`, ...args)
  }
}

// Pre-configured module loggers
export const loggers = {
  ws: new Logger('WS'),
  monitor: new Logger('Monitor'),
  miner: new Logger('Miner'),
  collector: new Logger('Collector'),
  dataSender: new Logger('DataSender'),
  executor: new Logger('Executor'),
  signal: new Logger('Signal'),
  parser: new Logger('Parser'),
  background: new Logger('Background'),
  ui: new Logger('UI'),
  main: new Logger('Main')
}

// Factory function for custom modules
export function createLogger(module: string): Logger {
  return new Logger(module)
}

// Global helper for quick logging (uses 'Main' module)
export const log = loggers.main

// Development helpers
export const devTools = {
  // Enable all debug logs
  enableDebug(): void {
    configureLogger({ level: 'debug' })
    console.log('%c[PO] Debug mode enabled', 'color: #0f0')
  },

  // Disable all logs except errors
  quiet(): void {
    configureLogger({ level: 'error' })
    console.log('%c[PO] Quiet mode enabled', 'color: #888')
  },

  // Reset to default
  reset(): void {
    configureLogger({
      level: 'info',
      enabledModules: '*',
      disabledModules: [],
      showTimestamp: false,
      showModule: true
    })
    console.log('%c[PO] Logger reset to defaults', 'color: #0f0')
  },

  // Disable specific modules
  mute(...modules: string[]): void {
    configureLogger({
      disabledModules: [...globalConfig.disabledModules, ...modules]
    })
    console.log(`%c[PO] Muted modules: ${modules.join(', ')}`, 'color: #888')
  },

  // Enable only specific modules
  focus(...modules: string[]): void {
    configureLogger({ enabledModules: modules })
    console.log(`%c[PO] Focusing on: ${modules.join(', ')}`, 'color: #0af')
  },

  // Show current config
  status(): void {
    console.log('%c[PO] Logger Config:', 'color: #0f0; font-weight: bold')
    console.table(globalConfig)
  }
}

// Expose devTools to window for console access
if (typeof window !== 'undefined') {
  (window as any).pqLog = devTools
}

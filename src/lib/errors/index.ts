// ============================================================
// Error Handling Module
// Centralized error normalization, formatting, and reporting
// ============================================================

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface ErrorContext {
  module: string
  action?: string
  userMessage?: string
  metadata?: Record<string, unknown>
}

export interface AppErrorOptions {
  code?: string
  severity?: ErrorSeverity
  context?: ErrorContext
  cause?: unknown
  isOperational?: boolean
}

export interface ToAppErrorOptions extends AppErrorOptions {
  message?: string
  fallbackMessage?: string
}

export type ErrorNotifier = (message: string, error: AppError) => Promise<void> | void

export interface ReportErrorOptions extends ToAppErrorOptions {
  notifier?: ErrorNotifier
  consolePrefix?: string
  includeStack?: boolean
}

export class AppError extends Error {
  code: string
  severity: ErrorSeverity
  context?: ErrorContext
  cause?: unknown
  isOperational: boolean
  timestamp: number

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? 'UNKNOWN_ERROR'
    this.severity = options.severity ?? 'error'
    this.context = options.context
    this.cause = options.cause
    this.isOperational = options.isOperational ?? true
    this.timestamp = Date.now()
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      cause: normalizeCause(this.cause),
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      stack: this.stack,
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof AppError && error.context?.userMessage) {
    return error.context.userMessage
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage
    }
  }

  return fallback
}

export function toAppError(error: unknown, options: ToAppErrorOptions = {}): AppError {
  if (error instanceof AppError) {
    if (
      !options.code &&
      !options.severity &&
      !options.context &&
      !options.cause &&
      !options.message &&
      !options.fallbackMessage &&
      options.isOperational === undefined
    ) {
      return error
    }

    return new AppError(options.message ?? error.message, {
      code: options.code ?? error.code,
      severity: options.severity ?? error.severity,
      context: options.context ?? error.context,
      cause: options.cause ?? error.cause,
      isOperational: options.isOperational ?? error.isOperational,
    })
  }

  const message = options.message ?? toErrorMessage(error, options.fallbackMessage)
  return new AppError(message, {
    code: options.code,
    severity: options.severity,
    context: options.context,
    cause: options.cause ?? error,
    isOperational: options.isOperational,
  })
}

export function formatError(
  error: AppError,
  options: { includeStack?: boolean; includeMetadata?: boolean } = {}
): string {
  const lines: string[] = []
  lines.push(`[${error.code}] ${error.message}`)

  if (error.context?.module) {
    lines.push(`module: ${error.context.module}`)
  }

  if (error.context?.action) {
    lines.push(`action: ${error.context.action}`)
  }

  if (options.includeMetadata && error.context?.metadata) {
    const metadata = safeJson(error.context.metadata)
    if (metadata) {
      lines.push(`metadata: ${metadata}`)
    }
  }

  if (options.includeStack && error.stack) {
    lines.push(error.stack)
  }

  return lines.join('\n')
}

export async function reportError(
  error: unknown,
  options: ReportErrorOptions = {}
): Promise<AppError> {
  const appError = toAppError(error, options)
  logToConsole(appError, options.consolePrefix, options.includeStack)

  if (options.notifier) {
    try {
      await options.notifier(formatError(appError, { includeMetadata: true }), appError)
    } catch (notifyError) {
      const notifierError = toAppError(notifyError, {
        code: 'ERROR_NOTIFIER_FAILED',
        severity: 'warning',
        context: {
          module: 'errors',
          action: 'notifier',
          metadata: { originalCode: appError.code },
        },
      })
      logToConsole(notifierError, 'ErrorNotifier', options.includeStack)
    }
  }

  // Auto-log to DB for error/critical severity
  // We do this after notifier to ensure notifier (e.g. toast) is fast
  if (appError.severity === 'error' || appError.severity === 'critical') {
    // using floating promise intentionally to not block execution
    import('./logger').then(({ logger }) => {
      logger.logError(appError, appError.context?.module || 'Unknown').catch(e => {
        console.error('Failed to auto-log error to DB', e)
      })
    })
  }

  return appError
}

function logToConsole(error: AppError, consolePrefix?: string, includeStack?: boolean): void {
  const prefix = consolePrefix ?? error.context?.module ?? 'Error'
  const message = formatError(error, { includeStack, includeMetadata: true })

  switch (error.severity) {
    case 'info':
      console.info(`[${prefix}] ${message}`)
      break
    case 'warning':
      console.warn(`[${prefix}] ${message}`)
      break
    case 'error':
    case 'critical':
      console.error(`[${prefix}] ${message}`)
      break
    default:
      console.error(`[${prefix}] ${message}`)
  }
}

function normalizeCause(cause?: unknown): unknown {
  if (!cause) return undefined
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack }
  }
  return cause
}

function safeJson(value: unknown): string | undefined {
  try {
    if (value === undefined) return undefined
    return truncate(JSON.stringify(value))
  } catch {
    return '[unserializable metadata]'
  }
}

function truncate(value: string, maxLength = 500): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

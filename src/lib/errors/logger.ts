import { LogRepository } from '../db'
import type { ErrorLog } from '../types'
import { type AppError, formatError } from './index'

export class ErrorLogger {
    private static instance: ErrorLogger

    private constructor() { }

    static getInstance(): ErrorLogger {
        if (!ErrorLogger.instance) {
            ErrorLogger.instance = new ErrorLogger()
        }
        return ErrorLogger.instance
    }

    async log(
        level: ErrorLog['severity'],
        message: string,
        options: {
            module?: string
            error?: Error | AppError
            metadata?: Record<string, unknown>
        } = {}
    ): Promise<void> {
        // 1. Console Logging (Developers always need this)
        const consoleMsg = `[${level.toUpperCase()}] [${options.module || 'Global'}] ${message}`

        if (level === 'error' || level === 'critical') {
            console.error(consoleMsg, options.error)
        } else if (level === 'warning') {
            console.warn(consoleMsg)
        } else {
            console.info(consoleMsg)
        }

        // 2. Persistent Logging (IndexedDB)
        // Critical/Error are always saved. Warning/Info depends on config (saving all for now for better debugging)
        try {
            const errorStack = options.error instanceof Error ? options.error.stack : undefined

            const logEntry: Omit<ErrorLog, 'id'> = {
                timestamp: Date.now(),
                severity: level,
                module: options.module || 'Unknown',
                message: message,
                stack: errorStack,
                metadata: options.metadata,
            }

            await LogRepository.add(logEntry)
        } catch (dbError) {
            // Fallback if DB logging fails - don't crash the app
            console.error('Failed to write error log to DB:', dbError)
        }
    }

    async logError(error: AppError | Error, module: string = 'Unknown'): Promise<void> {
        const severity = 'period' in error ? ('error' as const) : 'error' // Default to error
        // AppError might have its own severity, check it safely
        const appLevel = (error as any).severity as ErrorLog['severity'] | undefined
        const finalLevel = appLevel || 'error'

        await this.log(finalLevel, error.message, {
            module,
            error,
            metadata: (error as any).context,
        })
    }

    async clearLogs(olderThan?: number) {
        if (olderThan) {
            await LogRepository.clearOlderThan(olderThan)
        }
    }
}

export const logger = ErrorLogger.getInstance()

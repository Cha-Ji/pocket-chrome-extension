import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'
import { LogRepository } from '../db'
import { AppError } from './index'

// Mock db module
vi.mock('../db', () => ({
    LogRepository: {
        add: vi.fn(),
        clearOlderThan: vi.fn(),
    }
}))

describe('ErrorLogger', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => { })
        vi.spyOn(console, 'warn').mockImplementation(() => { })
        vi.spyOn(console, 'info').mockImplementation(() => { })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('logError saves to DB with correct format', async () => {
        const error = new AppError('Test Error', {
            code: 'TEST_CODE',
            severity: 'error',
            context: { module: 'TEST_MODULE', meta: 'data' }
        })

        await logger.logError(error, 'TEST_MODULE')

        expect(LogRepository.add).toHaveBeenCalledTimes(1)
        const calledArg = vi.mocked(LogRepository.add).mock.calls[0][0]

        expect(calledArg).toMatchObject({
            severity: 'error',
            module: 'TEST_MODULE',
            message: 'Test Error',
            metadata: { module: 'TEST_MODULE', meta: 'data' }
        })
        expect(calledArg.timestamp).toBeDefined()
    })

    it('log saves error severity to DB', async () => {
        await logger.log('error', 'Manual Error', { module: 'Manual' })
        expect(LogRepository.add).toHaveBeenCalledTimes(1)
    })

    it('log saves critical severity to DB', async () => {
        await logger.log('critical', 'Critical Error', { module: 'Manual' })
        expect(LogRepository.add).toHaveBeenCalledTimes(1)
    })

    it('handles DB errors gracefully', async () => {
        vi.mocked(LogRepository.add).mockRejectedValueOnce(new Error('DB Full'))

        // Should not throw
        await expect(logger.log('error', 'Test')).resolves.not.toThrow()

        // Should log the DB error to console
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to write error log to DB'),
            expect.anything()
        )
    })
})

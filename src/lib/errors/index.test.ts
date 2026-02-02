import { describe, it, expect, vi, afterEach } from 'vitest'
import { AppError, toAppError, toErrorMessage, reportError } from './index'

describe('errors module', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toErrorMessage prefers userMessage when available', () => {
    const error = new AppError('Internal failure', {
      context: { module: 'test', userMessage: 'Friendly message' },
    })

    expect(toErrorMessage(error)).toBe('Friendly message')
  })

  it('toAppError wraps unknown values with defaults', () => {
    const error = toAppError('Boom', {
      code: 'E_TEST',
      severity: 'warning',
      context: { module: 'test' },
    })

    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('E_TEST')
    expect(error.severity).toBe('warning')
    expect(error.message).toBe('Boom')
  })

  it('reportError calls notifier with formatted message', async () => {
    const notifier = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = await reportError(new Error('Failed'), {
      code: 'E_NOTIFY',
      context: { module: 'test', action: 'notify' },
      notifier,
    })

    expect(error).toBeInstanceOf(AppError)
    expect(notifier).toHaveBeenCalledTimes(1)
    const [message, payload] = notifier.mock.calls[0]
    expect(message).toContain('[E_NOTIFY]')
    expect(payload).toBeInstanceOf(AppError)
  })
})

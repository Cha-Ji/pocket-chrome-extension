import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusCard } from './StatusCard'
import type { TradingStatus } from '../../lib/types'

describe('StatusCard', () => {
  const defaultStatus: TradingStatus = {
    isRunning: false,
    currentTicker: undefined,
    balance: undefined,
    sessionId: undefined,
  }

  it('should render status title', () => {
    render(<StatusCard status={defaultStatus} />)
    // There are two "Status" texts - the title and the status label
    const statusTexts = screen.getAllByText('Status')
    expect(statusTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('should show "-" for undefined values', () => {
    render(<StatusCard status={defaultStatus} />)
    // Multiple "-" for undefined fields
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('should display ticker when provided', () => {
    const status: TradingStatus = {
      ...defaultStatus,
      currentTicker: 'EURUSD',
    }
    render(<StatusCard status={status} />)
    expect(screen.getByText('EURUSD')).toBeInTheDocument()
  })

  it('should display formatted balance when provided', () => {
    const status: TradingStatus = {
      ...defaultStatus,
      balance: 1000.50,
    }
    render(<StatusCard status={status} />)
    expect(screen.getByText('$1000.50')).toBeInTheDocument()
  })

  it('should display session ID when provided', () => {
    const status: TradingStatus = {
      ...defaultStatus,
      sessionId: 42,
    }
    render(<StatusCard status={status} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('should show "Active" when running', () => {
    const status: TradingStatus = {
      ...defaultStatus,
      isRunning: true,
    }
    render(<StatusCard status={status} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('should show "Inactive" when not running', () => {
    render(<StatusCard status={defaultStatus} />)
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })
})

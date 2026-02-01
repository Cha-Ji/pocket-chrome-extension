import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ControlPanel } from './ControlPanel'

describe('ControlPanel', () => {
  const defaultProps = {
    isRunning: false,
    isLoading: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
  }

  it('should render controls title', () => {
    render(<ControlPanel {...defaultProps} />)
    expect(screen.getByText('Controls')).toBeInTheDocument()
  })

  it('should show Start button when not running', () => {
    render(<ControlPanel {...defaultProps} />)
    expect(screen.getByText('▶ Start Trading')).toBeInTheDocument()
  })

  it('should show Stop button when running', () => {
    render(<ControlPanel {...defaultProps} isRunning={true} />)
    expect(screen.getByText('⏹ Stop Trading')).toBeInTheDocument()
  })

  it('should call onStart when Start button clicked', () => {
    const onStart = vi.fn()
    render(<ControlPanel {...defaultProps} onStart={onStart} />)
    
    fireEvent.click(screen.getByText('▶ Start Trading'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('should call onStop when Stop button clicked', () => {
    const onStop = vi.fn()
    render(<ControlPanel {...defaultProps} isRunning={true} onStop={onStop} />)
    
    fireEvent.click(screen.getByText('⏹ Stop Trading'))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('should show "Starting..." when loading and not running', () => {
    render(<ControlPanel {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Starting...')).toBeInTheDocument()
  })

  it('should show "Stopping..." when loading and running', () => {
    render(<ControlPanel {...defaultProps} isRunning={true} isLoading={true} />)
    expect(screen.getByText('Stopping...')).toBeInTheDocument()
  })

  it('should disable button when loading', () => {
    render(<ControlPanel {...defaultProps} isLoading={true} />)
    const button = screen.getByText('Starting...')
    expect(button).toBeDisabled()
  })

  it('should render quick action buttons', () => {
    render(<ControlPanel {...defaultProps} />)
    expect(screen.getByText('📊 Backtest')).toBeInTheDocument()
    expect(screen.getByText('⚙️ Settings')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogViewer } from './LogViewer';
import type { LogEntry } from '../hooks/useLogs';

describe('LogViewer', () => {
  const mockLogs: LogEntry[] = [
    { id: 1, timestamp: Date.now() - 2000, level: 'info', message: 'Info message' },
    { id: 2, timestamp: Date.now() - 1000, level: 'success', message: 'Success message' },
    { id: 3, timestamp: Date.now(), level: 'error', message: 'Error message' },
  ];

  it('should render logs title', () => {
    render(<LogViewer logs={[]} onClear={vi.fn()} />);
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  it('should show "No logs yet" when empty', () => {
    render(<LogViewer logs={[]} onClear={vi.fn()} />);
    expect(screen.getByText('No logs yet')).toBeInTheDocument();
  });

  it('should render log messages', () => {
    render(<LogViewer logs={mockLogs} onClear={vi.fn()} />);
    expect(screen.getByText('Info message')).toBeInTheDocument();
    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('should render log levels', () => {
    render(<LogViewer logs={mockLogs} onClear={vi.fn()} />);
    expect(screen.getByText('[INFO]')).toBeInTheDocument();
    expect(screen.getByText('[SUCCESS]')).toBeInTheDocument();
    expect(screen.getByText('[ERROR]')).toBeInTheDocument();
  });

  it('should call onClear when Clear button clicked', () => {
    const onClear = vi.fn();
    render(<LogViewer logs={mockLogs} onClear={onClear} />);

    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('should render Clear button', () => {
    render(<LogViewer logs={mockLogs} onClear={vi.fn()} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});

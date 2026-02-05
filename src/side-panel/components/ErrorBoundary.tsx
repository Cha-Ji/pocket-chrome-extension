import React, { Component, ErrorInfo, ReactNode } from 'react'
import {
  POError,
  ErrorCode,
  errorHandler,
  ErrorLogEntry,
  ErrorStats,
} from '../../lib/errors'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorHistory: ErrorLogEntry[]
  errorStats: ErrorStats | null
  showHistory: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorHistory: [],
    errorStats: null,
    showHistory: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error handler for centralized tracking
    const poError = POError.from(error, {
      module: 'side-panel',
      function: 'ErrorBoundary.componentDidCatch',
      extra: { componentStack: errorInfo.componentStack },
    })
    errorHandler.logError(poError)

    this.setState({
      error,
      errorInfo,
      errorHistory: errorHandler.getHistory(10),
      errorStats: errorHandler.getStats(),
    })
  }

  private toggleHistory = () => {
    this.setState((prev) => ({
      showHistory: !prev.showHistory,
      errorHistory: errorHandler.getHistory(20),
      errorStats: errorHandler.getStats(),
    }))
  }

  private copyErrorToClipboard = () => {
    const { error, errorInfo } = this.state
    const isPOError = error instanceof POError

    const errorText = isPOError
      ? (error as POError).toReadableString()
      : `${error?.toString()}\n\nComponent Stack:\n${errorInfo?.componentStack}`

    navigator.clipboard.writeText(errorText).then(() => {
      alert('Error copied to clipboard')
    })
  }

  private renderPOError(error: POError) {
    return (
      <>
        <div className="mb-2">
          <span className="bg-red-700 px-2 py-1 rounded text-sm font-mono">
            {error.code}
          </span>
          <span className="ml-2 bg-yellow-700 px-2 py-1 rounded text-sm">
            {error.severity}
          </span>
        </div>

        <pre className="bg-black p-3 rounded text-xs font-mono whitespace-pre-wrap mb-4">
          {error.message}
        </pre>

        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
          <div>
            <span className="text-gray-400">Module:</span>{' '}
            <span className="font-mono">{error.context.module}</span>
          </div>
          <div>
            <span className="text-gray-400">Function:</span>{' '}
            <span className="font-mono">{error.context.function}</span>
          </div>
          {error.context.path.length > 0 && (
            <div className="col-span-2">
              <span className="text-gray-400">Path:</span>{' '}
              <span className="font-mono text-yellow-300">
                {error.context.path.join(' → ')}
              </span>
            </div>
          )}
          <div className="col-span-2">
            <span className="text-gray-400">Time:</span>{' '}
            <span className="font-mono">
              {new Date(error.context.timestamp).toISOString()}
            </span>
          </div>
        </div>

        {error.context.extra && (
          <details className="mb-4">
            <summary className="cursor-pointer font-bold text-sm">
              Extra Context
            </summary>
            <pre className="bg-black p-2 rounded text-xs font-mono mt-2 whitespace-pre-wrap">
              {JSON.stringify(error.context.extra, null, 2)}
            </pre>
          </details>
        )}

        {error.cause && (
          <details className="mb-4">
            <summary className="cursor-pointer font-bold text-sm">
              Caused By
            </summary>
            <pre className="bg-black p-2 rounded text-xs font-mono mt-2 whitespace-pre-wrap">
              {error.cause.message}
              {'\n\n'}
              {error.cause.stack}
            </pre>
          </details>
        )}
      </>
    )
  }

  private renderGenericError(error: Error | null, errorInfo: ErrorInfo | null) {
    return (
      <>
        <pre className="bg-black p-3 rounded text-xs font-mono whitespace-pre-wrap mb-4">
          {error?.toString()}
        </pre>

        {errorInfo?.componentStack && (
          <details className="mb-4">
            <summary className="cursor-pointer font-bold text-sm">
              Component Stack
            </summary>
            <pre className="bg-black p-2 rounded text-xs font-mono mt-2 whitespace-pre-wrap">
              {errorInfo.componentStack}
            </pre>
          </details>
        )}

        {error?.stack && (
          <details className="mb-4">
            <summary className="cursor-pointer font-bold text-sm">
              Stack Trace
            </summary>
            <pre className="bg-black p-2 rounded text-xs font-mono mt-2 whitespace-pre-wrap">
              {error.stack}
            </pre>
          </details>
        )}
      </>
    )
  }

  private renderErrorStats() {
    const { errorStats } = this.state
    if (!errorStats) return null

    return (
      <div className="bg-gray-800 p-3 rounded mb-4">
        <h4 className="font-bold text-sm mb-2">Error Statistics</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>Total Errors: {errorStats.total}</div>
          <div>
            Last Error:{' '}
            {errorStats.lastErrorAt
              ? new Date(errorStats.lastErrorAt).toLocaleTimeString()
              : 'N/A'}
          </div>
        </div>
        {Object.entries(errorStats.bySeverity).some(([, v]) => v > 0) && (
          <div className="mt-2 text-xs">
            <span className="text-gray-400">By Severity:</span>
            <div className="flex gap-2 mt-1">
              {Object.entries(errorStats.bySeverity).map(([severity, count]) =>
                count > 0 ? (
                  <span key={severity} className="bg-gray-700 px-2 py-1 rounded">
                    {severity}: {count}
                  </span>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  private renderErrorHistory() {
    const { errorHistory, showHistory } = this.state
    if (!showHistory || errorHistory.length === 0) return null

    return (
      <div className="bg-gray-800 p-3 rounded mb-4">
        <h4 className="font-bold text-sm mb-2">Recent Errors ({errorHistory.length})</h4>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {errorHistory.map((entry) => (
            <div
              key={entry.id}
              className="bg-gray-900 p-2 rounded text-xs font-mono"
            >
              <div className="flex justify-between items-start">
                <span className="text-yellow-400">[{entry.error.code}]</span>
                <span className="text-gray-500">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-gray-300 mt-1 truncate">
                {entry.error.message}
              </div>
              <div className="text-gray-500 text-xs mt-1">
                {entry.error.context.module}.{entry.error.context.function}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state
      const isPOError = error instanceof POError

      return (
        <div className="p-4 bg-red-900 text-white min-h-screen overflow-auto">
          <h2 className="text-xl font-bold mb-2">⚠️ Something went wrong</h2>
          <p className="mb-4 text-sm text-gray-300">
            {isPOError
              ? 'A tracked error occurred. Details below:'
              : 'An unexpected error occurred. Please report this error:'}
          </p>

          {isPOError
            ? this.renderPOError(error as POError)
            : this.renderGenericError(error, errorInfo)}

          {this.renderErrorStats()}
          {this.renderErrorHistory()}

          <div className="flex gap-2 flex-wrap">
            <button
              className="px-4 py-2 bg-white text-red-900 font-bold rounded hover:bg-gray-200"
              onClick={() => window.location.reload()}
            >
              Reload Panel
            </button>

            <button
              className="px-4 py-2 bg-gray-700 text-white font-bold rounded hover:bg-gray-600"
              onClick={this.copyErrorToClipboard}
            >
              Copy Error
            </button>

            <button
              className="px-4 py-2 bg-gray-700 text-white font-bold rounded hover:bg-gray-600"
              onClick={this.toggleHistory}
            >
              {this.state.showHistory ? 'Hide History' : 'Show History'}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

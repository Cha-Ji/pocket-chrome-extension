import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900 text-white min-h-screen overflow-auto">
          <h2 className="text-xl font-bold mb-2">⚠️ Something went wrong</h2>
          <p className="mb-4">Please report this error:</p>
          <pre className="bg-black p-2 rounded text-xs font-mono whitespace-pre-wrap">
            {this.state.error?.toString()}
          </pre>
          <details className="mt-4">
            <summary className="cursor-pointer font-bold">Stack Trace</summary>
            <pre className="bg-black p-2 rounded text-xs font-mono mt-2 whitespace-pre-wrap">
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button
            className="mt-4 px-4 py-2 bg-white text-red-900 font-bold rounded"
            onClick={() => window.location.reload()}
          >
            Reload Panel
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

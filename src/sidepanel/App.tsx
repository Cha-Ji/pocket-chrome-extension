import React, { useEffect, useState } from 'react';
import { Controls } from './components/Controls';
import { Status } from './components/Status';
import { Logs } from './components/Logs';

export interface TradingSession {
  state: 'idle' | 'running' | 'paused' | 'error';
  activeTabId: number | null;
  startTime: number | null;
  tradesCount: number;
  wins: number;
  losses: number;
}

export function App() {
  const [session, setSession] = useState<TradingSession>({
    state: 'idle',
    activeTabId: null,
    startTime: null,
    tradesCount: 0,
    wins: 0,
    losses: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);

  // 상태 폴링
  useEffect(() => {
    const fetchState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (response.success) {
          setSession(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch state:', error);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1000);

    return () => clearInterval(interval);
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
  };

  const handleStart = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      addLog('Error: No active tab found');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'START_TRADING',
      tabId: tab.id,
    });

    if (response.success) {
      addLog('Trading started');
    } else {
      addLog('Failed to start trading');
    }
  };

  const handlePause = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'PAUSE_TRADING' });
    if (response.success) {
      addLog('Trading paused');
    }
  };

  const handleStop = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'STOP_TRADING' });
    if (response.success) {
      addLog('Trading stopped');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Pocket Option Auto-Trading</h1>
        <p className="text-gray-400 text-sm">v0.1.0</p>
      </header>

      <Status session={session} />

      <Controls
        state={session.state}
        onStart={handleStart}
        onPause={handlePause}
        onStop={handleStop}
      />

      <Logs logs={logs} />
    </div>
  );
}

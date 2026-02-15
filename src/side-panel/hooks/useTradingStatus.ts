import { useState, useEffect, useCallback } from 'react';
import { TradingStatus } from '../../lib/types';
import { sendRuntimeMessage, onRuntimeMessage } from '../infrastructure/extension-client';

const initialStatus: TradingStatus = {
  isRunning: false,
  currentTicker: undefined,
  balance: undefined,
  sessionId: undefined,
};

export function useTradingStatus() {
  const [status, setStatus] = useState<TradingStatus>(initialStatus);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial status
  useEffect(() => {
    sendRuntimeMessage('GET_STATUS')
      .then((response) => {
        if (response) {
          setStatus(response as TradingStatus);
        }
      })
      .catch((error) => {
        console.warn('[side-panel] Failed to load initial status:', error);
      });
  }, []);

  // Listen for status updates
  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message.type === 'STATUS_UPDATE' && message.payload) {
        setStatus(message.payload as TradingStatus);
      }
    });
  }, []);

  const startTrading = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const response = (await sendRuntimeMessage('START_TRADING')) as {
        success: boolean;
        error?: string;
      } | null;
      return response ?? { success: false, error: 'No response' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[side-panel] Start trading error:', error);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopTrading = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const response = (await sendRuntimeMessage('STOP_TRADING')) as {
        success: boolean;
        error?: string;
      } | null;
      return response ?? { success: false, error: 'No response' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[side-panel] Stop trading error:', error);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    isLoading,
    startTrading,
    stopTrading,
  };
}

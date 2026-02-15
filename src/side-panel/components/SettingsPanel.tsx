import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelegramConfig,
  DEFAULT_TELEGRAM_CONFIG,
  TelegramService,
} from '../../lib/notifications/telegram';
import { loadTelegramConfig, saveTelegramConfig } from '../../lib/config';
import { sendRuntimeMessage } from '../infrastructure/extension-client';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Minimal bot token format check: "digits:alphanumeric" */
function isValidBotToken(token: string): boolean {
  if (!token) return true; // empty is valid (means unconfigured)
  return /^\d+:[A-Za-z0-9_-]+$/.test(token);
}

/** Chat ID: numeric, optionally prefixed with "-" */
function isValidChatId(chatId: string): boolean {
  if (!chatId) return true; // empty is valid (means unconfigured)
  return /^-?\d+$/.test(chatId);
}

export function SettingsPanel() {
  // Persisted config (source of truth from storage)
  const [savedConfig, setSavedConfig] = useState<TelegramConfig>(DEFAULT_TELEGRAM_CONFIG);
  // Local draft for text fields (botToken, chatId)
  const [draft, setDraft] = useState<{ botToken: string; chatId: string }>({
    botToken: '',
    chatId: '',
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string>('');
  const [testStatus, setTestStatus] = useState<string>('');
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadConfig();
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  const loadConfig = async () => {
    const telegramConfig = await loadTelegramConfig();
    setSavedConfig(telegramConfig);
    setDraft({ botToken: telegramConfig.botToken, chatId: telegramConfig.chatId });
  };

  // ---------- Derived state ----------

  const tokenValid = isValidBotToken(draft.botToken);
  const chatIdValid = isValidChatId(draft.chatId);
  const formValid = tokenValid && chatIdValid;

  const isDirty = draft.botToken !== savedConfig.botToken || draft.chatId !== savedConfig.chatId;

  // The "effective" config merges persisted toggles + current draft text (for Test Connection)
  const effectiveConfig: TelegramConfig = {
    ...savedConfig,
    botToken: draft.botToken,
    chatId: draft.chatId,
  };

  // ---------- Save helpers ----------

  const showSaveStatus = useCallback((status: SaveStatus, error = '') => {
    setSaveStatus(status);
    setSaveError(error);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    if (status === 'saved' || status === 'error') {
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  /** Persist a full TelegramConfig to storage + broadcast */
  const persistConfig = async (newConfig: TelegramConfig) => {
    showSaveStatus('saving');
    try {
      await saveTelegramConfig(newConfig);
      sendRuntimeMessage('RELOAD_TELEGRAM_CONFIG', newConfig);
      setSavedConfig(newConfig);
      showSaveStatus('saved');
      console.log('[Settings] Telegram config saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showSaveStatus('error', msg);
      console.error('[Settings] Save failed:', msg);
    }
  };

  // ---------- Handlers ----------

  /** Checkbox toggles save immediately using persisted text values (never draft text) */
  const handleToggle = (key: 'enabled' | 'notifySignals' | 'notifyTrades', value: boolean) => {
    persistConfig({ ...savedConfig, [key]: value });
  };

  /** Text fields update local draft only */
  const handleDraftChange = (key: 'botToken' | 'chatId', value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Clear any stale save error when user starts editing
    if (saveStatus === 'error') setSaveStatus('idle');
  };

  /** Explicit save: validate + persist */
  const handleSave = () => {
    if (!formValid || !isDirty) return;
    persistConfig({ ...savedConfig, botToken: draft.botToken, chatId: draft.chatId });
  };

  /** Discard draft changes */
  const handleDiscard = () => {
    setDraft({ botToken: savedConfig.botToken, chatId: savedConfig.chatId });
    setSaveStatus('idle');
    setSaveError('');
  };

  const handleTest = async () => {
    setTestStatus('Sending...');
    const service = new TelegramService(effectiveConfig);
    const success = await service.sendMessage(
      '🔔 <b>Test Notification</b>\nPocket Quant connected successfully!',
    );
    setTestStatus(success ? '✅ Success' : '❌ Failed');
    setTimeout(() => setTestStatus(''), 3000);
  };

  // ---------- Render ----------

  return (
    <div className="space-y-4 p-2">
      <div className="bg-pocket-dark rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between">
          Telegram Notification
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={savedConfig.enabled}
              onChange={(e) => handleToggle('enabled', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-pocket-blue focus:ring-pocket-blue bg-gray-700"
              aria-label="Enable Telegram notifications"
            />
          </div>
        </h2>

        <div className="space-y-3">
          {/* Bot Token */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bot Token</label>
            <input
              type="password"
              value={draft.botToken}
              onChange={(e) => handleDraftChange('botToken', e.target.value)}
              className={`w-full bg-gray-800 border rounded px-2 py-1 text-xs text-white focus:outline-none ${
                !tokenValid
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-700 focus:border-pocket-blue'
              }`}
              placeholder="123456:ABC-DEF1234..."
              aria-invalid={!tokenValid}
              aria-describedby={!tokenValid ? 'token-error' : undefined}
            />
            {!tokenValid && (
              <p id="token-error" className="text-[10px] text-red-400 mt-0.5" role="alert">
                Invalid format. Expected: 123456:ABC-DEF...
              </p>
            )}
          </div>

          {/* Chat ID */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Chat ID</label>
            <input
              type="text"
              value={draft.chatId}
              onChange={(e) => handleDraftChange('chatId', e.target.value)}
              className={`w-full bg-gray-800 border rounded px-2 py-1 text-xs text-white focus:outline-none ${
                !chatIdValid
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-700 focus:border-pocket-blue'
              }`}
              placeholder="-100123456789"
              aria-invalid={!chatIdValid}
              aria-describedby={!chatIdValid ? 'chatid-error' : undefined}
            />
            {!chatIdValid && (
              <p id="chatid-error" className="text-[10px] text-red-400 mt-0.5" role="alert">
                Invalid format. Expected: numeric (e.g. -100123456789)
              </p>
            )}
          </div>

          {/* Save / Discard bar — shown only when draft differs from saved */}
          {isDirty && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!formValid || saveStatus === 'saving'}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  !formValid || saveStatus === 'saving'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-pocket-green text-white hover:bg-green-600'
                }`}
                aria-busy={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                onClick={handleDiscard}
                disabled={saveStatus === 'saving'}
                className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                Discard
              </button>
            </div>
          )}

          {/* Save status indicator */}
          {saveStatus === 'saved' && !isDirty && (
            <p className="text-[10px] text-green-400" role="status">
              Saved successfully
            </p>
          )}
          {saveStatus === 'error' && (
            <p className="text-[10px] text-red-400" role="alert">
              Save failed{saveError ? `: ${saveError}` : ''}
            </p>
          )}

          {/* Notification toggles */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="flex items-center space-x-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={savedConfig.notifySignals}
                onChange={(e) => handleToggle('notifySignals', e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              <span>Signals</span>
            </label>
            <label className="flex items-center space-x-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={savedConfig.notifyTrades}
                onChange={(e) => handleToggle('notifyTrades', e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              <span>Trades</span>
            </label>
          </div>

          {/* Test Connection */}
          <button
            onClick={handleTest}
            disabled={!effectiveConfig.botToken || !effectiveConfig.chatId}
            className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
              !effectiveConfig.botToken || !effectiveConfig.chatId
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-pocket-blue text-white hover:bg-blue-600'
            }`}
          >
            {testStatus || 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="text-[10px] text-gray-600 px-2">
        <p>1. Create bot via @BotFather</p>
        <p>2. Get Token</p>
        <p>3. Start chat with bot</p>
        <p>4. Get Chat ID via @userinfobot</p>
      </div>
    </div>
  );
}

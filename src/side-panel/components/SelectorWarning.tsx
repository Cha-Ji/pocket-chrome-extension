import { useState } from 'react';
import { usePortSubscription } from '../hooks/usePortSubscription';
import type { MessagePayloadMap } from '../../lib/types';

type HealthcheckPayload = MessagePayloadMap['SELECTOR_HEALTHCHECK_RESULT'];

/**
 * Displays a warning banner when selector healthcheck detects failures.
 * - Critical failures: red banner, trading halted
 * - Non-critical failures: yellow warning
 * - Unknown environment: orange notice
 *
 * Receives data via port subscription (push from background).
 */
export function SelectorWarning() {
  const [result, setResult] = useState<HealthcheckPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  usePortSubscription('SELECTOR_HEALTHCHECK_RESULT', (payload) => {
    setResult(payload as HealthcheckPayload);
    setDismissed(false); // Show again on new result
  });

  // Don't render if no result, passed, or dismissed
  if (!result || result.passed || dismissed) return null;

  const isCritical = result.tradingHalted;
  const isUnknown = result.environment === 'unknown';

  return (
    <div
      className={`rounded-lg p-3 text-xs ${
        isCritical
          ? 'bg-red-900/40 border border-red-500/50'
          : isUnknown
            ? 'bg-orange-900/40 border border-orange-500/50'
            : 'bg-yellow-900/40 border border-yellow-500/50'
      }`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p
            className={`font-semibold ${
              isCritical ? 'text-red-400' : isUnknown ? 'text-orange-400' : 'text-yellow-400'
            }`}
          >
            {isCritical
              ? 'Trading Halted — Critical Selectors Missing'
              : isUnknown
                ? 'Unknown Environment Detected'
                : 'Selector Warning'}
          </p>

          {result.criticalFailures.length > 0 && (
            <p className="text-red-300 mt-1">
              Critical: {result.criticalFailures.join(', ')}
            </p>
          )}

          {result.nonCriticalFailures.length > 0 && (
            <p className="text-yellow-300 mt-1">
              Warning: {result.nonCriticalFailures.join(', ')}
            </p>
          )}

          <p className="text-gray-400 mt-1">
            env={result.environment} | v{result.version}
          </p>
        </div>

        {/* Dismiss button — only for non-critical warnings */}
        {!isCritical && (
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
            aria-label="Dismiss warning"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}

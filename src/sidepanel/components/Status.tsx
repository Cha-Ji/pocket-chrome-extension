import React from 'react';
import type { TradingSession } from '../App';

interface StatusProps {
  session: TradingSession;
}

export function Status({ session }: StatusProps) {
  const winRate =
    session.tradesCount > 0
      ? ((session.wins / session.tradesCount) * 100).toFixed(1)
      : '0.0';

  const stateColors = {
    idle: 'bg-gray-500',
    running: 'bg-green-500',
    paused: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const formatDuration = (startTime: number | null): string => {
    if (!startTime) return '--:--:--';

    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mb-6 p-4 bg-gray-800 rounded-lg">
      <h2 className="text-lg font-semibold mb-3">Status</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-gray-400 text-sm">State</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${stateColors[session.state]}`}
            />
            <span className="font-medium capitalize">{session.state}</span>
          </div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Duration</span>
          <div className="font-medium">{formatDuration(session.startTime)}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Trades</span>
          <div className="font-medium">{session.tradesCount}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Win Rate</span>
          <div className="font-medium">{winRate}%</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Wins</span>
          <div className="font-medium text-green-400">{session.wins}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Losses</span>
          <div className="font-medium text-red-400">{session.losses}</div>
        </div>
      </div>
    </div>
  );
}

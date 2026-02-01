import React from 'react';

interface ControlsProps {
  state: 'idle' | 'running' | 'paused' | 'error';
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function Controls({ state, onStart, onPause, onStop }: ControlsProps) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Controls</h2>
      <div className="flex gap-2">
        {state === 'idle' || state === 'paused' ? (
          <button
            onClick={onStart}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            {state === 'paused' ? 'Resume' : 'Start'}
          </button>
        ) : null}

        {state === 'running' ? (
          <button
            onClick={onPause}
            className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Pause
          </button>
        ) : null}

        {state !== 'idle' ? (
          <button
            onClick={onStop}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );
}

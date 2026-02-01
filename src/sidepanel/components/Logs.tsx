import React from 'react';

interface LogsProps {
  logs: string[];
}

export function Logs({ logs }: LogsProps) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Logs</h2>
      <div className="bg-gray-800 rounded-lg p-3 h-48 overflow-y-auto font-mono text-sm">
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs yet...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="text-gray-300 mb-1">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

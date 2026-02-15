import { TradingStatus } from '../../lib/types';
import { formatMoney } from '../utils/format';

interface StatusCardProps {
  status: TradingStatus;
}

export function StatusCard({ status }: StatusCardProps) {
  return (
    <div className="bg-pocket-dark rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Status</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatItem label="Ticker" value={status.currentTicker || '-'} />
        <StatItem
          label="Balance"
          value={status.balance ? `$${formatMoney(status.balance)}` : '-'}
        />
        <StatItem label="Session" value={status.sessionId ? `#${status.sessionId}` : '-'} />
        <StatItem
          label="Status"
          value={status.isRunning ? 'Active' : 'Inactive'}
          valueClass={status.isRunning ? 'text-pocket-green' : 'text-gray-400'}
        />
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  valueClass?: string;
}

function StatItem({ label, value, valueClass = 'text-white' }: StatItemProps) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}

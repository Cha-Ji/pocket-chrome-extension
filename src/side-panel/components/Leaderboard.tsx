import { useState, useMemo, useCallback } from 'react';
import type { LeaderboardEntry, LeaderboardSortKey } from '../../lib/backtest/leaderboard-types';
import { formatMoney, formatPercent, formatNumber } from '../utils/format';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isRunning: boolean;
  progress?: { completed: number; total: number; currentStrategy: string };
  onRun: () => void;
}

type SortDir = 'asc' | 'desc';

const SORT_CONFIGS: Record<
  LeaderboardSortKey,
  { label: string; defaultDir: SortDir; higherIsBetter: boolean }
> = {
  compositeScore: { label: 'Score', defaultDir: 'desc', higherIsBetter: true },
  winRate: { label: 'Win Rate', defaultDir: 'desc', higherIsBetter: true },
  netProfit: { label: 'Net Profit', defaultDir: 'desc', higherIsBetter: true },
  profitFactor: { label: 'PF', defaultDir: 'desc', higherIsBetter: true },
  tradesPerDay: { label: 'Trades/Day', defaultDir: 'desc', higherIsBetter: true },
  maxDrawdownPercent: { label: 'MDD', defaultDir: 'asc', higherIsBetter: false },
  maxConsecutiveLosses: { label: 'Max Loss', defaultDir: 'asc', higherIsBetter: false },
  dailyVolume: { label: 'Daily Vol', defaultDir: 'desc', higherIsBetter: true },
  daysToVolumeTarget: { label: 'Vol Days', defaultDir: 'asc', higherIsBetter: false },
  sharpeRatio: { label: 'Sharpe', defaultDir: 'desc', higherIsBetter: true },
  recoveryFactor: { label: 'Recovery', defaultDir: 'desc', higherIsBetter: true },
  kellyFraction: { label: 'Kelly %', defaultDir: 'desc', higherIsBetter: true },
};

export function Leaderboard({ entries, isRunning, progress, onRun }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>('compositeScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSort = useCallback(
    (key: LeaderboardSortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(SORT_CONFIGS[key].defaultDir);
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [entries, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Leaderboard</h2>
        <button
          onClick={onRun}
          disabled={isRunning}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            isRunning
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-pocket-green text-white hover:bg-pocket-green/80'
          }`}
        >
          {isRunning ? 'Running...' : 'Run Backtest'}
        </button>
      </div>

      {/* Progress Bar */}
      {isRunning && progress && (
        <div className="bg-pocket-dark rounded-lg p-3">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>{progress.currentStrategy}</span>
            <span>
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-pocket-green h-1.5 rounded-full transition-all"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Strategies" value={entries.length.toString()} />
          <MiniStat
            label="Best WR"
            value={`${formatPercent(Math.max(...entries.map((e) => e.winRate)))}%`}
            positive
          />
          <MiniStat
            label="Profitable"
            value={entries.filter((e) => e.winRate >= 52.1).length.toString()}
            positive={entries.some((e) => e.winRate >= 52.1)}
          />
        </div>
      )}

      {/* Sort Buttons */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(
            [
              'compositeScore',
              'winRate',
              'netProfit',
              'tradesPerDay',
              'maxDrawdownPercent',
              'daysToVolumeTarget',
            ] as LeaderboardSortKey[]
          ).map((key) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                sortKey === key
                  ? 'bg-pocket-green/20 text-pocket-green border border-pocket-green/30'
                  : 'bg-pocket-dark text-gray-400 hover:text-white'
              }`}
            >
              {SORT_CONFIGS[key].label}
              {sortKey === key && (sortDir === 'asc' ? ' ^' : ' v')}
            </button>
          ))}
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 && !isRunning ? (
        <div className="bg-pocket-dark rounded-lg p-8 text-center">
          <div className="text-gray-500 text-xs">
            No leaderboard data yet.
            <br />
            Click "Run Backtest" to compare all strategies.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((entry) => (
            <LeaderboardCard
              key={entry.strategyId}
              entry={entry}
              expanded={expandedId === entry.strategyId}
              onToggle={() =>
                setExpandedId(expandedId === entry.strategyId ? null : entry.strategyId)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function LeaderboardCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: LeaderboardEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isProfitable = entry.winRate >= 52.1;
  const scoreColor =
    entry.compositeScore >= 70
      ? 'text-pocket-green'
      : entry.compositeScore >= 50
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div
      className={`bg-pocket-dark rounded-lg overflow-hidden border transition ${
        isProfitable ? 'border-pocket-green/20' : 'border-transparent'
      }`}
    >
      {/* Main Row */}
      <button onClick={onToggle} className="w-full p-3 text-left hover:bg-white/5 transition">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-gray-500 w-5">#{entry.rank}</span>
          <span className="text-xs font-bold text-white flex-1 truncate">{entry.strategyName}</span>
          {entry.grade && <GradeBadge grade={entry.grade} />}
          <span className={`text-sm font-bold font-mono ${scoreColor}`}>
            {formatNumber(entry.compositeScore)}
          </span>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10px]">
          <MetricCell
            label="WR"
            value={`${formatPercent(entry.winRate)}%`}
            highlight={isProfitable}
          />
          <MetricCell label="PF" value={formatNumber(entry.profitFactor, 2)} />
          <MetricCell label="MDD" value={`${formatPercent(entry.maxDrawdownPercent)}%`} negative />
          <MetricCell label="MaxL" value={`${entry.maxConsecutiveLosses}x`} negative />
          <MetricCell label="T/Day" value={formatNumber(entry.tradesPerDay, 1)} />
          <MetricCell
            label="Net"
            value={`$${formatMoney(entry.netProfit)}`}
            highlight={entry.netProfit > 0}
            negative={entry.netProfit < 0}
          />
          <MetricCell label="D.Vol" value={`$${formatNumber(entry.dailyVolume)}`} />
          <MetricCell
            label="Vol"
            value={entry.daysToVolumeTarget !== null ? `${entry.daysToVolumeTarget}d` : 'N/A'}
            highlight={entry.daysToVolumeTarget !== null && entry.daysToVolumeTarget <= 30}
          />
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700/50 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <DetailRow label="Total Trades" value={entry.totalTrades.toString()} />
            <DetailRow label="Wins / Losses" value={`${entry.wins} / ${entry.losses}`} />
            <DetailRow label="Trading Days" value={entry.tradingDays.toString()} />
            <DetailRow label="Expectancy" value={`$${formatMoney(entry.expectancy)}`} />
            {entry.absoluteScore !== undefined && (
              <DetailRow
                label="Abs. Score"
                value={`${formatNumber(entry.absoluteScore, 1)} (${entry.grade})`}
              />
            )}
            <DetailRow label="Sharpe Ratio" value={formatNumber(entry.sharpeRatio, 2)} />
            <DetailRow label="Sortino Ratio" value={formatNumber(entry.sortinoRatio, 2)} />
            <DetailRow label="Recovery Factor" value={formatNumber(entry.recoveryFactor, 2)} />
            <DetailRow label="Max Win Streak" value={`${entry.maxConsecutiveWins}x`} />
            <DetailRow label="Kelly Fraction" value={`${formatPercent(entry.kellyFraction)}%`} />
            <DetailRow label="WR Stability" value={`±${formatPercent(entry.winRateStdDev)}%`} />
            <DetailRow label="Min Balance" value={`$${formatNumber(entry.minRequiredBalance)}`} />
            <DetailRow label="Total Volume" value={`$${formatNumber(entry.totalVolume)}`} />
          </div>

          {/* Strategy Parameters */}
          <div className="mt-1">
            <div className="text-[9px] text-gray-500 uppercase mb-1">Parameters</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(entry.params).map(([k, v]) => (
                <span
                  key={k}
                  className="px-1.5 py-0.5 bg-gray-800 rounded text-[9px] text-gray-400"
                >
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  let color = 'text-gray-300';
  if (highlight) color = 'text-pocket-green';
  if (negative) color = 'text-red-400';

  return (
    <div>
      <div className="text-gray-600">{label}</div>
      <div className={`font-mono font-medium ${color}`}>{value}</div>
    </div>
  );
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-500/20 text-green-400 border-green-500/30',
  B: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  C: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  D: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  F: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${GRADE_COLORS[grade] ?? GRADE_COLORS.F}`}
    >
      {grade}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 font-mono">{value}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-pocket-dark rounded-lg p-2 text-center">
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className={`text-sm font-bold ${positive ? 'text-pocket-green' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function getSortValue(entry: LeaderboardEntry, key: LeaderboardSortKey): number {
  switch (key) {
    case 'compositeScore':
      return entry.compositeScore;
    case 'winRate':
      return entry.winRate;
    case 'netProfit':
      return entry.netProfit;
    case 'profitFactor':
      return isFinite(entry.profitFactor) ? entry.profitFactor : 999;
    case 'tradesPerDay':
      return entry.tradesPerDay;
    case 'maxDrawdownPercent':
      return entry.maxDrawdownPercent;
    case 'maxConsecutiveLosses':
      return entry.maxConsecutiveLosses;
    case 'dailyVolume':
      return entry.dailyVolume;
    case 'daysToVolumeTarget':
      return entry.daysToVolumeTarget ?? 9999;
    case 'sharpeRatio':
      return entry.sharpeRatio;
    case 'recoveryFactor':
      return isFinite(entry.recoveryFactor) ? entry.recoveryFactor : 999;
    case 'kellyFraction':
      return entry.kellyFraction;
  }
}

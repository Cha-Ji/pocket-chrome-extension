
import { useMemo } from 'react'
import { TradingStatus, Trade } from '../../lib/types'
import { formatMoney, formatPercent, formatNumber } from '../utils/format'

interface DashboardProps {
  status: TradingStatus
  trades: Trade[]
}

export function Dashboard({ status, trades }: DashboardProps) {
  const stats = useMemo(() => {
    const total = trades.length
    const wins = trades.filter(t => t.result === 'WIN').length
    const losses = trades.filter(t => t.result === 'LOSS').length
    const ties = trades.filter(t => t.result === 'TIE').length
    // Policy A: winRate = wins / (wins + losses), ties excluded from denominator
    const decided = wins + losses
    const winRate = decided > 0 ? (wins / decided) * 100 : 0
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0)

    return { total, wins, losses, ties, winRate, totalProfit }
  }, [trades])

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard 
          label="Total Profit" 
          value={`$${formatMoney(stats.totalProfit)}`} 
          valueClass={stats.totalProfit >= 0 ? 'text-pocket-green' : 'text-red-400'}
        />
        <StatCard 
          label="Win Rate" 
          value={`${formatPercent(stats.winRate)}%`} 
          valueClass="text-white"
        />
        <StatCard 
          label="Trades" 
          value={stats.total.toString()} 
          valueClass="text-white"
        />
        <StatCard 
          label="Status" 
          value={status.isRunning ? 'Active' : 'Stopped'} 
          valueClass={status.isRunning ? 'text-pocket-green' : 'text-gray-400'}
        />
      </div>

      {/* PnL Chart */}
      <div className="bg-pocket-dark rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Equity Curve (PnL)</h3>
        <PnLChart trades={trades} />
      </div>

      {/* Recent Performance */}
      <div className="bg-pocket-dark rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Asset Performance</h3>
        <div className="space-y-2">
          {/* Mock asset stats for now or group from trades */}
          <AssetStatRow name="BTC USD" wins={5} losses={2} />
          <AssetStatRow name="EUR USD" wins={3} losses={1} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, valueClass }: { label: string, value: string, valueClass: string }) {
  return (
    <div className="bg-pocket-dark rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}

function AssetStatRow({ name, wins, losses }: { name: string, wins: number, losses: number }) {
  const total = wins + losses
  const rate = (wins / total) * 100
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-300">{name}</span>
      <div className="flex gap-3">
        <span className="text-pocket-green">{wins}W</span>
        <span className="text-red-400">{losses}L</span>
        <span className="text-white font-mono">{formatNumber(rate)}%</span>
      </div>
    </div>
  )
}

function PnLChart({ trades }: { trades: Trade[] }) {
  if (trades.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-600 text-xs italic">
        Need more data to draw chart...
      </div>
    )
  }

  // Calculate cumulative profit
  let current = 0
  const points = trades.map(t => {
    current += (t.profit || 0)
    return current
  })

  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const range = max - min || 1
  const height = 100
  const width = 200
  
  const svgPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="w-full h-32 relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {/* Zero line */}
        <line 
          x1="0" y1={height - ((0 - min) / range) * height} 
          x2={width} y2={height - ((0 - min) / range) * height} 
          stroke="#374151" strokeWidth="1" strokeDasharray="2,2" 
        />
        {/* PnL Path */}
        <polyline
          fill="none"
          stroke="#00b073"
          strokeWidth="2"
          points={svgPoints}
        />
      </svg>
    </div>
  )
}

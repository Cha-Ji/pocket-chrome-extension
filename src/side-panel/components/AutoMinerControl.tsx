import { useState, useEffect } from 'react'
import { sendTabMessageCallback, sendTabMessageSafe } from '../infrastructure/extension-client'

interface AssetProgress {
  asset: string
  totalCandles: number
  daysCollected: number
  isComplete: boolean
  requestCount: number
}

interface MinerStatus {
  isActive: boolean
  current: string | null
  completed: number
  failed: number
  assetProgress: AssetProgress[]
  overallCandles: number
  elapsedSeconds: number
  candlesPerSecond: number
  config: {
    offsetSeconds: number
    maxDaysBack: number
    requestDelayMs: number
  }
}

const DEFAULT_STATUS: MinerStatus = {
  isActive: false,
  current: null,
  completed: 0,
  failed: 0,
  assetProgress: [],
  overallCandles: 0,
  elapsedSeconds: 0,
  candlesPerSecond: 0,
  config: { offsetSeconds: 300000, maxDaysBack: 30, requestDelayMs: 500 },
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function AutoMinerControl() {
  const [status, setStatus] = useState<MinerStatus>(DEFAULT_STATUS)

  useEffect(() => {
    const fetchStatus = () => {
      sendTabMessageCallback('GET_MINER_STATUS', (res) => {
        if (res) setStatus(prev => ({ ...DEFAULT_STATUS, ...prev, ...(res as Partial<MinerStatus>) }))
      })
    }
    const interval = setInterval(fetchStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  const toggleMiner = () => {
    const action = status.isActive ? 'STOP_AUTO_MINER' : 'START_AUTO_MINER'
    sendTabMessageSafe(action)
  }

  const completedAssets = status.assetProgress?.filter(a => a.isComplete) || []
  const miningAsset = status.assetProgress?.find(a => !a.isComplete && a.totalCandles > 0)

  return (
    <div className="p-4 bg-gray-800 rounded-lg mt-4 border border-purple-500">
      {/* 헤더 */}
      <h3 className="text-lg font-bold text-white mb-3 flex items-center">
        <span>⛏️ Bulk History Miner</span>
        {status.isActive && <span className="ml-2 w-3 h-3 bg-green-500 rounded-full animate-pulse"/>}
      </h3>

      {/* 전체 통계 */}
      {(status.overallCandles > 0 || status.isActive) && (
        <div className="bg-gray-900 rounded-md p-3 mb-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">총 수집 캔들</span>
            <span className="text-green-400 font-bold">{formatNumber(status.overallCandles)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">수집 속도</span>
            <span className="text-cyan-400 font-mono">{status.candlesPerSecond} candles/s</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">경과 시간</span>
            <span className="text-gray-300">{formatElapsed(status.elapsedSeconds)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">완료 자산</span>
            <span className="text-yellow-400">
              {status.completed}개{status.failed > 0 && <span className="text-red-400 ml-1">(실패 {status.failed})</span>}
            </span>
          </div>
        </div>
      )}

      {/* 현재 채굴 중인 자산 */}
      {status.isActive && miningAsset && (
        <div className="bg-gray-900 rounded-md p-3 mb-3 border-l-2 border-purple-500">
          <div className="text-xs text-gray-500 mb-1">현재 채굴 중</div>
          <div className="text-purple-400 font-bold text-sm mb-1">{miningAsset.asset}</div>
          <div className="flex gap-3 text-xs text-gray-400">
            <span>📊 {formatNumber(miningAsset.totalCandles)}</span>
            <span>📅 {miningAsset.daysCollected}d</span>
            <span>📤 req#{miningAsset.requestCount}</span>
          </div>
        </div>
      )}

      {status.isActive && !miningAsset && status.current && (
        <div className="bg-gray-900 rounded-md p-3 mb-3 border-l-2 border-yellow-500">
          <div className="text-xs text-gray-500 mb-1">자산 전환 중...</div>
          <div className="text-yellow-400 font-bold text-sm">{status.current}</div>
        </div>
      )}

      {/* 완료된 자산 목록 */}
      {completedAssets.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">완료된 자산</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {completedAssets.map(a => (
              <div key={a.asset} className="flex justify-between text-xs bg-gray-900 rounded px-2 py-1">
                <span className="text-green-400">✅ {a.asset}</span>
                <span className="text-gray-400">{formatNumber(a.totalCandles)} | {a.daysCollected}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 시작/중지 버튼 */}
      <button
        onClick={toggleMiner}
        className={`w-full py-3 rounded font-bold transition-all ${
          status.isActive
            ? 'bg-red-600 hover:bg-red-700 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
            : 'bg-purple-600 hover:bg-purple-700 shadow-[0_0_15px_rgba(147,51,234,0.5)]'
        } text-white`}
      >
        {status.isActive ? '🛑 Stop Mining' : '🚀 Start Bulk Mining'}
      </button>

      <p className="text-xs text-gray-500 mt-2 text-center">
        *92%+ 자산 자동 순회, 자산당 최대 {status.config?.maxDaysBack || 30}일 히스토리 수집
      </p>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { DataSender } from '../../lib/data-sender'
import { usePortSubscription } from '../hooks/usePortSubscription'
import { sendTabMessageSafe } from '../infrastructure/extension-client'

// ============================================================
// History Miner Component
// ============================================================
// 역할: 차트를 자동으로 스크롤하여 과거 데이터 수집
// ============================================================

export function HistoryMiner() {
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [stats, setStats] = useState({ collected: 0, total: 0 })
  const [serverHealth, setServerHealth] = useState(false)

  // 서버 상태 주기적 체크 (visibility-aware)
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState === 'hidden') return
      const healthy = await DataSender.checkHealth()
      setServerHealth(healthy)
    }
    check()
    const interval = setInterval(check, 5000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // 채굴 시작/중지 핸들러
  const toggleMining = () => {
    if (!serverHealth) {
      alert('Local Collector Server is offline! Run: npx tsx scripts/data-collector-server.ts')
      return
    }

    const newState = !isActive
    setIsActive(newState)

    sendTabMessageSafe('TOGGLE_MINING', { active: newState })
  }

  // 채굴 진행상황 리스너 (via port push, replaces onMessage listener)
  const handleMiningStats = useCallback((payload: unknown) => {
    if (payload) {
      const p = payload as { collected: number; total?: number }
      setStats({ collected: p.collected, total: p.total ?? 0 })
      setStatus(`Mining... Collected: ${p.collected}`)
    }
  }, [])
  usePortSubscription('MINING_STATS', handleMiningStats)

  const handleMiningStopped = useCallback(() => {
    setIsActive(false)
    setStatus('Stopped')
  }, [])
  usePortSubscription('MINING_STOPPED', handleMiningStopped)

  return (
    <div className="p-4 bg-gray-800 rounded-lg mt-4">
      <h3 className="text-lg font-bold text-white mb-2">⛏️ History Miner</h3>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${serverHealth ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-300">
            Server: {serverHealth ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="text-sm text-gray-400">
          Total in DB: {stats.total}
        </div>
      </div>

      <div className="bg-gray-900 p-3 rounded mb-4 font-mono text-xs">
        {status}
      </div>

      <button
        onClick={toggleMining}
        className={`w-full py-2 rounded font-bold transition-colors ${
          isActive
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        } ${!serverHealth && 'opacity-50 cursor-not-allowed'}`}
        disabled={!serverHealth}
      >
        {isActive ? '⏹ Stop Mining' : '▶ Start Mining'}
      </button>

      <p className="text-xs text-gray-500 mt-2 text-center">
        *Scrolls chart automatically to load history
      </p>
    </div>
  )
}

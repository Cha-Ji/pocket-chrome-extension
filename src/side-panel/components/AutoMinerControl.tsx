import React, { useState, useEffect } from 'react'

export function AutoMinerControl() {
  const [status, setStatus] = useState<any>({ isActive: false, current: null, completed: 0 })

  useEffect(() => {
    const fetchStatus = () => {
      // Side Panel에서 chrome.tabs.query 사용 시 권한 또는 컨텍스트 문제 가능성 있음
      // 에러 처리를 추가하여 렌더링 중단을 방지
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_MINER_STATUS' }, (res) => {
              // chrome.runtime.lastError 확인 (메시지 수신자 없을 때 발생)
              if (chrome.runtime.lastError) {
                // Content script not ready or error
                return
              }
              if (res) setStatus(res)
            })
          }
        })
      } catch (e) {
        console.error('AutoMinerControl error:', e)
      }
    }
    const interval = setInterval(fetchStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  const toggleMiner = () => {
    const action = status.isActive ? 'STOP_AUTO_MINER' : 'START_AUTO_MINER'
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: action })
      }
    })
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg mt-4 border border-purple-500">
      <h3 className="text-lg font-bold text-white mb-2 flex items-center">
        🤖 Auto Asset Miner
        {status.isActive && <span className="ml-2 w-3 h-3 bg-green-500 rounded-full animate-pulse"/>}
      </h3>
      
      <div className="text-sm text-gray-300 mb-4 space-y-1">
        <div>Target: <span className="text-purple-400 font-bold">{status.current || 'None'}</span></div>
        <div>Mined Assets: <span className="text-green-400 font-bold">{status.completed}</span></div>
      </div>

      <button
        onClick={toggleMiner}
        className={`w-full py-3 rounded font-bold transition-all ${
          status.isActive 
            ? 'bg-red-600 hover:bg-red-700 shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
            : 'bg-purple-600 hover:bg-purple-700 shadow-[0_0_15px_rgba(147,51,234,0.5)]'
        } text-white`}
      >
        {status.isActive ? '🛑 Stop Auto Mining' : '🚀 Start Auto Mining'}
      </button>
      
      <p className="text-xs text-gray-500 mt-2 text-center">
        *Automatically switches assets (92%+) and collects history
      </p>
    </div>
  )
}

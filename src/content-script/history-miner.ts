// ============================================================
// History Miner Logic (Content Script)
// ============================================================
// 차트 요소를 찾아서 자동으로 스크롤 이벤트를 발생시킴
// ============================================================

import { DataSender } from '../lib/data-sender'

let miningInterval: NodeJS.Timeout | null = null
let collectedCount = 0

export function initHistoryMiner() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_MINING') {
      if (message.payload.active) {
        startMining()
      } else {
        stopMining()
      }
    }
  })
}

function startMining() {
  if (miningInterval) return
  
  console.log('⛏️ History Miner Started')
  const chartContainer = document.querySelector('.chart-container') || document.body
  
  // 1초마다 왼쪽으로 스크롤 (과거 데이터 로딩 트리거)
  miningInterval = setInterval(() => {
    // 마우스 휠 이벤트 시뮬레이션 (가로 스크롤)
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      view: window,
      deltaX: -500, // 왼쪽으로 스크롤
      deltaY: 0,
    })
    
    // 차트 캔버스 찾기 (가장 큰 캔버스 타겟팅)
    const canvas = findMainCanvas()
    if (canvas) {
      canvas.dispatchEvent(wheelEvent)
      
      // 상태 업데이트 전송
      chrome.runtime.sendMessage({
        type: 'MINING_STATS',
        payload: { collected: collectedCount }
      }).catch(() => {}) // 무시 (패널이 닫혀있을 수 있음)
    }
  }, 500) // 0.5초 간격 (너무 빠르면 차단될 수 있음)
}

function stopMining() {
  if (miningInterval) {
    clearInterval(miningInterval)
    miningInterval = null
    console.log('⏹ History Miner Stopped')
    
    chrome.runtime.sendMessage({
      type: 'MINING_STOPPED'
    }).catch(() => {})
  }
}

function findMainCanvas(): HTMLCanvasElement | null {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  // 크기가 가장 큰 캔버스가 차트일 확률이 높음
  return canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null
}

// 캔들 데이터 수집 훅 (기존 수집기에 추가)
export function onCandleCaptured(candles: any[]) {
  if (miningInterval) {
    // 채굴 중이면 서버로 대량 전송
    DataSender.sendHistory(candles)
    collectedCount += candles.length
  }
}

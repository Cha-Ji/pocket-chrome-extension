// ============================================================
// Auto Miner - Autonomous Asset Rotation & Mining
// ============================================================
// 역할: 페이아웃 92%+ 자산을 순회하며 과거 데이터를 자동으로 수집
// ============================================================

import { PayoutMonitor } from './payout-monitor'
import { DataSender } from '../lib/data-sender'

interface MiningState {
  isActive: boolean
  currentAsset: string | null
  assetsToMine: string[]
  completedAssets: Set<string>
  miningDuration: number // ms per asset
}

let minerState: MiningState = {
  isActive: false,
  currentAsset: null,
  assetsToMine: [],
  completedAssets: new Set(),
  miningDuration: 30000 // 30초 채굴
}

let scrollInterval: NodeJS.Timeout | null = null
let rotationTimeout: NodeJS.Timeout | null = null
let payoutMonitorRef: PayoutMonitor | null = null

export const AutoMiner = {
  init(monitor: PayoutMonitor) {
    payoutMonitorRef = monitor
    console.log('[AutoMiner] Initialized')
  },

  start() {
    if (minerState.isActive) return
    console.log('[AutoMiner] 🚀 Starting autonomous mining...')
    
    minerState.isActive = true
    minerState.completedAssets.clear()
    
    this.scanAndMineNext()
  },

  stop() {
    console.log('[AutoMiner] ⏹ Stopping mining...')
    minerState.isActive = false
    this.stopScrolling()
    
    if (rotationTimeout) {
      clearTimeout(rotationTimeout)
      rotationTimeout = null
    }
  },

  scanAndMineNext() {
    if (!minerState.isActive || !payoutMonitorRef) return

    // 1. 고페이아웃 자산 스캔
    const highPayoutAssets = payoutMonitorRef.getHighPayoutAssets()
      .filter(asset => asset.payout >= 92)
      .map(asset => asset.name)

    // 2. 아직 채굴 안 한 자산 찾기
    const nextAsset = highPayoutAssets.find(asset => !minerState.completedAssets.has(asset))

    if (!nextAsset) {
      console.log('[AutoMiner] ✅ All assets mined! Waiting 5 min before restart...')
      minerState.completedAssets.clear()
      rotationTimeout = setTimeout(() => this.scanAndMineNext(), 5 * 60 * 1000)
      return
    }

    // 3. 자산 전환 및 채굴 시작
    console.log(`[AutoMiner] ⛏️ Target acquired: ${nextAsset}`)
    this.mineAsset(nextAsset)
  },

  async mineAsset(assetName: string) {
    // 자산 전환
    const switched = await payoutMonitorRef?.switchAsset(assetName)
    if (!switched) {
      console.warn(`[AutoMiner] Failed to switch to ${assetName}, skipping...`)
      minerState.completedAssets.add(assetName)
      this.scanAndMineNext()
      return
    }

    minerState.currentAsset = assetName
    
    // 차트 로딩 대기 (3초)
    await new Promise(r => setTimeout(r, 3000))

    // 스크롤 시작
    this.startScrolling()

    // 채굴 시간 후 종료 및 다음 자산
    rotationTimeout = setTimeout(() => {
      this.stopScrolling()
      minerState.completedAssets.add(assetName)
      console.log(`[AutoMiner] ✅ Finished mining ${assetName}`)
      this.scanAndMineNext()
    }, minerState.miningDuration)
  },

  startScrolling() {
    if (scrollInterval) return
    console.log('[AutoMiner] Scrolling chart...')

    const chartContainer = document.querySelector('.chart-container') || document.body
    
    scrollInterval = setInterval(() => {
      const wheelEvent = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: window,
        deltaX: -500, // 왼쪽으로 스크롤
        deltaY: 0,
      })
      
      const canvas = document.querySelector('canvas')
      if (canvas) {
        canvas.dispatchEvent(wheelEvent)
      }
    }, 500)
  },

  stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval)
      scrollInterval = null
    }
  },

  getStatus() {
    return {
      isActive: minerState.isActive,
      current: minerState.currentAsset,
      completed: Array.from(minerState.completedAssets).length
    }
  }
}

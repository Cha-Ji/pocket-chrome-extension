import { PayoutMonitor } from './payout-monitor'
import { DataSender } from '../lib/data-sender'

interface MiningState {
  isActive: boolean
  currentAsset: string | null
  assetsToMine: string[]
  completedAssets: Set<string>
  miningDuration: number
}

let minerState: MiningState = {
  isActive: false,
  currentAsset: null,
  assetsToMine: [],
  completedAssets: new Set(),
  miningDuration: 30000
}

let scrollInterval: NodeJS.Timeout | null = null
let rotationTimeout: NodeJS.Timeout | null = null
let payoutMonitorRef: PayoutMonitor | null = null

export const AutoMiner = {
  init(monitor: PayoutMonitor) {
    payoutMonitorRef = monitor
    console.log('[PO] [Miner] Initialized')
  },

  start() {
    if (minerState.isActive) return
    console.log('[PO] [Miner] 🚀 Starting autonomous mining...')
    minerState.isActive = true
    minerState.completedAssets.clear()
    this.scanAndMineNext()
  },

  stop() {
    console.log('[PO] [Miner] ⏹ Stopping mining...')
    minerState.isActive = false
    this.stopScrolling()
    if (rotationTimeout) { clearTimeout(rotationTimeout); rotationTimeout = null; }
  },

  scanAndMineNext() {
    if (!minerState.isActive || !payoutMonitorRef) return
    const highPayoutAssets = payoutMonitorRef.getHighPayoutAssets().filter(asset => asset.payout >= 92).map(asset => asset.name)
    console.log(`[PO] [Miner] Found ${highPayoutAssets.length} high payout assets. Completed: ${minerState.completedAssets.size}`)
    const nextAsset = highPayoutAssets.find(asset => !minerState.completedAssets.has(asset))
    if (!nextAsset) {
      console.log('[PO] [Miner] ✅ All assets mined! Waiting 5 min...')
      minerState.completedAssets.clear()
      rotationTimeout = setTimeout(() => this.scanAndMineNext(), 5 * 60 * 1000)
      return
    }
    console.log(`[PO] [Miner] ⛏️ Next Target: ${nextAsset}`)
    this.mineAsset(nextAsset)
  },

  async mineAsset(assetName: string) {
    const switched = await payoutMonitorRef?.switchAsset(assetName)
    if (!switched) {
      console.warn(`[PO] [Miner] Failed to switch to ${assetName}, skipping...`)
      minerState.completedAssets.add(assetName)
      this.scanAndMineNext()
      return
    }
    minerState.currentAsset = assetName
    await new Promise(r => setTimeout(r, 3000))
    this.startScrolling()
    rotationTimeout = setTimeout(() => {
      this.stopScrolling()
      minerState.completedAssets.add(assetName)
      console.log(`[PO] [Miner] ✅ Finished mining ${assetName}`)
      this.scanAndMineNext()
    }, minerState.miningDuration)
  },

  startScrolling() {
    if (scrollInterval) return
    console.log('[PO] [Miner] Scrolling chart...')
    scrollInterval = setInterval(() => {
      const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, view: window, deltaX: -500, deltaY: 0 })
      const canvas = document.querySelector('canvas')
      if (canvas) canvas.dispatchEvent(wheelEvent)
    }, 500)
  },

  stopScrolling() {
    if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
  },

  getStatus() {
    return {
      isActive: minerState.isActive,
      current: minerState.currentAsset,
      completed: Array.from(minerState.completedAssets).length
    }
  }
}

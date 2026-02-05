import { PayoutMonitor } from './payout-monitor'
import { DataSender } from '../lib/data-sender'
import { getWebSocketInterceptor } from './websocket-interceptor'

interface MiningState {
  isActive: boolean
  currentAsset: string | null
  assetsToMine: string[]
  completedAssets: Set<string>
  miningDuration: number
  lastRequestAt: number
}

let minerState: MiningState = {
  isActive: false,
  currentAsset: null,
  assetsToMine: [],
  completedAssets: new Set(),
  miningDuration: 10000, // [PO-17] 직접 요청 시 대기 시간 단축
  lastRequestAt: 0
}

let requestInterval: NodeJS.Timeout | null = null
let rotationTimeout: NodeJS.Timeout | null = null
let payoutMonitorRef: PayoutMonitor | null = null

export const AutoMiner = {
  init(monitor: PayoutMonitor) {
    payoutMonitorRef = monitor
    console.log('[PO] [Miner] Initialized')
  },

  start() {
    if (minerState.isActive) return
    console.log('[PO] [Miner] 🚀 Starting WebSocket-Direct mining...')
    minerState.isActive = true
    minerState.completedAssets.clear()
    this.scanAndMineNext()
  },

  stop() {
    console.log('[PO] [Miner] ⏹ Stopping mining...')
    minerState.isActive = false
    this.stopRequesting()
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
    await new Promise(r => setTimeout(r, 4000)) // [PO-17] 로딩 대기 시간 충분히 확보 (2s -> 4s)

    this.startRequesting()
    
    rotationTimeout = setTimeout(() => {
      this.stopRequesting()
      minerState.completedAssets.add(assetName)
      console.log(`[PO] [Miner] ✅ Finished mining ${assetName}`)
      this.scanAndMineNext()
    }, minerState.miningDuration)
  },

  /**
   * [PO-17] WebSocket을 통해 직접 데이터 요청
   */
  startRequesting() {
    if (requestInterval) return
    console.log('[PO] [Miner] Requesting history via WebSocket...');
    
    const interceptor = getWebSocketInterceptor();
    const asset = minerState.currentAsset || '';
    
    requestInterval = setInterval(() => {
      // 1. 추적된 실제 자산 ID 가져오기 (가장 확실함)
      const trackedId = interceptor.getActiveAssetId();
      
      // 2. 만약 추적된 ID가 없으면 UI 이름을 기반으로 변환 (백업)
      const fallbackId = asset.toUpperCase().replace(/\s+OTC$/i, '_otc').replace(/\s+/g, '_');
      const finalAssetId = trackedId || (fallbackId.startsWith('#') ? fallbackId : '#' + fallbackId);

      console.log(`[PO] [Miner] 📤 Direct History Request for: ${finalAssetId}`);
      
      // 패턴 A: getHistory
      interceptor.send(`42["getHistory",{"asset":"${finalAssetId}","period":60}]`);
      
      // 패턴 B: load_history
      interceptor.send(`42["load_history",{"symbol":"${finalAssetId}","period":60}]`);

    }, 3000) // 요청 주기 3초로 약간 완화
  },

  stopRequesting() {
    if (requestInterval) { clearInterval(requestInterval); requestInterval = null; }
  },

  getStatus() {
    return {
      isActive: minerState.isActive,
      current: minerState.currentAsset,
      completed: Array.from(minerState.completedAssets).length
    }
  }
}

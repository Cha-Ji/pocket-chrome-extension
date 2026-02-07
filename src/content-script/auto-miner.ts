import { PayoutMonitor } from './payout-monitor'
import { getWebSocketInterceptor } from './websocket-interceptor'
import { loggers } from '../lib/logger'

const log = loggers.miner

interface MiningState {
  isActive: boolean
  currentAsset: string | null
  assetsToMine: string[]
  completedAssets: Set<string>
  miningDuration: number
  lastRequestAt: number
}

const minerState: MiningState = {
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
    log.info('Initialized')
  },

  start() {
    log.info('🚀 Starting WebSocket-Direct mining...')
    minerState.isActive = true
    minerState.completedAssets.clear()
    this.scanAndMineNext()
  },

  stop() {
    log.info('⏹ Stopping mining...')
    minerState.isActive = false
    this.stopRequesting()
    if (rotationTimeout) { clearTimeout(rotationTimeout); rotationTimeout = null; }
  },

  scanAndMineNext() {
    if (!minerState.isActive || !payoutMonitorRef) return
    // Use getAvailableAssets() which excludes assets in cooldown
    const availableAssets = payoutMonitorRef.getAvailableAssets().filter(asset => asset.payout >= 92).map(asset => asset.name)
    log.info(`Found ${availableAssets.length} available assets. Completed: ${minerState.completedAssets.size}`)
    const nextAsset = availableAssets.find(asset => !minerState.completedAssets.has(asset))
    
    if (!nextAsset) {
      log.info('✅ All assets mined or none found! Waiting 1 min...')
      minerState.completedAssets.clear()
      rotationTimeout = setTimeout(() => this.scanAndMineNext(), 1 * 60 * 1000)
      return
    }

    log.info(`⛏️ Next Target: ${nextAsset}`)
    this.mineAsset(nextAsset)
  },

  async mineAsset(assetName: string) {
    const switched = await payoutMonitorRef?.switchAsset(assetName)
    if (!switched) {
      log.warn(`Failed to switch to ${assetName}, skipping...`)
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
      log.info(`✅ Finished mining ${assetName}`)
      this.scanAndMineNext()
    }, minerState.miningDuration)
  },

  /**
   * [PO-17] WebSocket을 통해 직접 데이터 요청
   */
  startRequesting() {
    if (requestInterval) return
    log.info('Requesting history via WebSocket...');
    
    const interceptor = getWebSocketInterceptor();
    const asset = minerState.currentAsset || '';
    
    requestInterval = setInterval(() => {
      // 1. 추적된 실제 자산 ID 가져오기 (가장 확실함)
      const trackedId = interceptor.getActiveAssetId();
      
      // 2. 만약 추적된 ID가 없으면 UI 이름을 기반으로 변환 (백업)
      const fallbackId = asset.toUpperCase().replace(/\s+OTC$/i, '_otc').replace(/\s+/g, '_');
      const finalAssetId = trackedId || (fallbackId.startsWith('#') ? fallbackId : '#' + fallbackId);

      const now = Math.floor(Date.now() / 1000);
      const index = now * 100 + Math.floor(Math.random() * 100);

      log.info(`📤 Requesting loadHistoryPeriod for: ${finalAssetId}`);
      
      // [PO-17] 사용자가 직접 확인한 고성능 패킷 포맷 적용
      interceptor.send(`42["loadHistoryPeriod",{"asset":"${finalAssetId}","index":${index},"time":${now},"offset":9000,"period":60}]`);
      
      // 백업용 getHistory
      interceptor.send(`42["getHistory",{"asset":"${finalAssetId}","period":60}]`);

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

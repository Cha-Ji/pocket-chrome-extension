# 발견사항 — Navigator (자산 이동 자동화)

## 결정 사항

- (2026-01-26) 관심 종목 리스트를 순회하거나 조건 발생 시 즉시 이동
- (2026-02-06) 자산 전환은 `PayoutMonitor.switchAsset()` 메서드로 구현됨

## 제약/가정

- (2026-01-26) 자산 선택 UI 제어 또는 URL 파라미터 조작 필요
- (2026-02-06) React 기반 SPA → 일반 `click()` 이벤트가 작동하지 않음
- (2026-02-06) `forceClick()`으로 React 이벤트 우회 필요 (Main World 브릿지 `remote-click` 메시지)
- (2026-02-06) 자산 전환 후 WebSocket 데이터 안정화까지 4초 대기 필요 (`auto-miner.ts` 기준)

## 핵심 정보

- (2026-01-26) 이동 시나리오: A 감시 → B 신호 → B 이동 → 매매
- (2026-01-26) React Router 강제 리로딩 방지 고려

### 구현 현황

**PayoutMonitor** (`content-script/payout-monitor.ts`):
- `switchAsset(assetName)` — 자산 목록에서 해당 자산을 찾아 `forceClick()`으로 선택
- `getHighPayoutAssets()` — 페이아웃 ≥92% 자산 필터링
- `getBestAsset()` — 최고 페이아웃 자산 반환
- `getAvailableAssets()` — 쿨다운 중이 아닌 자산만 반환 (5분 쿨다운, 최대 3회 재시도)
- DOM 셀렉터: `.assets-block__alist.alist`, `.alist__item`, `.alist__label`, `.alist__payout`

**AutoMiner** (`content-script/auto-miner.ts`):
- 고페이아웃 자산 자동 순회: `scanAndMineNext()` → `mineAsset()` → 다음 자산
- 자산 전환 시 `payoutMonitorRef.switchAsset(assetName)` 호출
- 전환 후 4초 대기 → WebSocket으로 `loadHistoryPeriod` 요청 → 채굴 완료 후 다음 자산

**WebSocket 자산 추적** (`websocket-interceptor.ts`):
- `changeSymbol` WS 메시지 가로채서 `lastAssetId` 갱신
- `getActiveAssetId()` — 현재 활성 자산 ID 반환 (AutoMiner가 히스토리 요청 시 사용)

### DOM 상호작용 패턴

```
1. PayoutMonitor.fetchPayouts()  → DOM에서 자산 목록 파싱
2. AutoMiner.mineAsset(name)     → PayoutMonitor.switchAsset(name) 호출
3. switchAsset()                 → forceClick(assetElement)
4. forceClick()                  → window.postMessage({ type: 'remote-click' })
5. Tampermonkey (Main World)     → document.querySelector(selector).click()
```

## 코드 스니펫

```typescript
// 자산 전환 + 데이터 채굴 흐름 (auto-miner.ts)
async mineAsset(assetName: string) {
  const switched = await payoutMonitorRef?.switchAsset(assetName)
  if (!switched) { this.scanAndMineNext(); return; }

  await new Promise(r => setTimeout(r, 4000)) // 로딩 대기
  this.startRequesting() // WebSocket 히스토리 요청 시작

  rotationTimeout = setTimeout(() => {
    this.stopRequesting()
    minerState.completedAssets.add(assetName)
    this.scanAndMineNext() // 다음 자산으로
  }, minerState.miningDuration)
}
```

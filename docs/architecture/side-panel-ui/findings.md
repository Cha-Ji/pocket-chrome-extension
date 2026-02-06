# 발견사항 — Side Panel UI

## 결정 사항

- (2026-01-26) Side Panel UI는 사용자 제어 패널 역할을 담당
- (2026-01-26) UI 스택은 React + Tailwind CSS를 기본으로 고려
- (2026-02-06) 6개 탭 구조로 확정: signals, auto, status, logs, leaderboard, settings

## 제약/가정

- (2026-01-26) 시작/정지, 로그, 백테스트 결과 표시가 필수
- (2026-02-06) Background와 `chrome.runtime.sendMessage`로만 통신 — Content Script 직접 접근 불가
- (2026-02-06) Side Panel이 닫혀 있을 때 Background에서 보내는 `STATUS_UPDATE`는 조용히 실패 (정상)

## 핵심 정보

- (2026-01-26) 제어 기능: 시작/정지, 로그 확인, 결과 조회
- (2026-01-26) Side Panel을 기본 UI 위치로 사용

### 진입점: `src/side-panel/App.tsx`

`ErrorBoundary`로 감싸진 `AppContent` 컴포넌트가 메인 UI:

**탭 구조**:
- `signals` — `SignalPanel.tsx`: 실시간 CALL/PUT 신호 목록, 신호 상태(pending/win/loss)
- `auto` — `AutoTradePanel.tsx`: 자동매매 설정(금액, 리스크, 쿨다운) 및 시작/중지 + `AutoMinerControl.tsx`, `HistoryMiner.tsx`
- `status` — `Dashboard.tsx` + `StatusCard.tsx`: 거래 통계, 잔액, 승률
- `logs` — `LogViewer.tsx`: 실시간 로그 스트림
- `leaderboard` — `Leaderboard.tsx`: 전략별 백테스트 성과 순위표 (DB에서 로드/실행)
- `settings` — `SettingsPanel.tsx`: 텔레그램 봇 토큰/채팅 ID 설정

**커스텀 훅**:
- `useTradingStatus()` — Background에서 `GET_STATUS` 폴링, `startTrading`/`stopTrading` 명령
- `useLogs()` — 로그 배열 관리 (최대 100줄), `addLog(level, message)`
- `useTrades()` — 거래 히스토리 조회

**리더보드 백테스트**:
- `runLeaderboard()` 호출 시 `CandleRepository`에서 캔들 로드 → `initializeBacktest()` → 전략 순위 계산
- 결과를 `LeaderboardRepository`에 저장하여 영구 보존

## 코드 스니펫

```typescript
// 탭 전환 상태 관리
const [activeTab, setActiveTab] = useState<
  'signals' | 'auto' | 'status' | 'logs' | 'leaderboard' | 'settings'
>('signals')

// 리더보드 실행
const handleRunLeaderboard = async () => {
  setLbRunning(true)
  const candles = await CandleRepository.getAll()
  const entries = await runLeaderboard(candles, (progress) => setLbProgress(progress))
  setLbEntries(entries)
  await LeaderboardRepository.saveAll(entries)
}
```

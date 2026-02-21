# Auto Miner 자산 전환 실패 및 OTC 시장 닫힘 오판 버그 수정

## 체크리스트

### 분석
- [x] 로그 흐름 분석 (Pattern 1 감지 → tryReloadInactive 실패 → skip)
- [x] `detectAssetUnavailable()` 오탐 가능성 분석
- [x] `tryReloadInactive()` 실패 원인 분석
- [x] `consecutiveUnavailable` 카운터 로직 검증

### 버그 수정
- [x] Bug 1: `tryReloadInactive` — 고정 3초 대기 → 폴링 기반 소멸 감지 (최대 8초, 1초 간격)
- [x] Bug 2: `switchAsset` — 피커 닫기 후 1초→2초 + 일시적 unavailable 자동 해소 대기 (2초 추가)
- [x] Bug 3: `consecutiveUnavailable` — `isAssetUnavailable()`로 실제 unavailable만 카운트
- [x] Bug 4: OTC 시장 닫힘 임계값 3→5로 상향

### 검증
- [x] 빌드 성공 확인
- [x] 관련 테스트 실행 — payout-monitor.test.ts 34/34 pass

# Findings: Auto Miner 자산 전환 실패

## 2026-02-08 근본 원인 분석

### 로그 흐름 재구성

```
switchAsset("Microsoft OTC")
  → dismissStaleInactive() (이전 자산의 잔류 오버레이 제거)
  → openAssetPicker() → findAssetElement() → forceClick()
  → wait(2000) → UI 확인 (.current-symbol) → 전환 성공!
  → closeAssetPicker() → wait(1000)
  → detectAssetUnavailable() → Pattern 1 감지!
    → ".asset-inactive" 존재 + "불가능" 텍스트
  → tryReloadInactive()
    → forceClick(inactiveEl) → wait(3000) → 여전히 존재
    → forceClick(inactiveEl) → wait(3000) → 여전히 존재
    → "리로드 시도 모두 실패"
  → switchAsset return false
  → mineAsset: "Failed to switch" → consecutiveUnavailable++
  → 3개 연속 → "OTC 시장 닫혀있는 것으로 판단, 5분 후 재시도"
```

### Bug 1: tryReloadInactive 타이밍 문제

`.asset-inactive` 오버레이에 "다시 로드하려면 클릭"이 표시될 때, `forceClick` 후 3초만 대기한다.
그런데 PO 플랫폼에서 자산 리로드는 WebSocket 재연결 + 차트 재렌더링을 수반하므로 3초로는 부족할 수 있다.

**해결**: wait 시간을 5초로 증가 + 오버레이 소멸 감지 폴링 추가

### Bug 2: detectAssetUnavailable 호출 타이밍

`switchAsset`에서 피커를 닫은 후 1초만 대기하고 `detectAssetUnavailable`을 호출한다.
자산 전환 직후 `.asset-inactive`가 일시적으로 표시되었다가 사라지는 경우가 있는데,
1초 대기로는 이 일시적 상태를 오탐할 수 있다.

**해결**: 피커 닫기 후 대기 시간 증가 + 재확인 로직

### Bug 3: consecutiveUnavailable 구분 부족

현재 `mineAsset`에서 `switched === false`이면 무조건 `consecutiveUnavailable++` 한다.
그러나 실패 원인은 크게 2가지:
1. **실제 이용 불가** (asset-inactive, 시장 닫힘)
2. **기술적 전환 실패** (DOM 업데이트 지연, 클릭 미반응)

기술적 실패도 consecutiveUnavailable에 카운트되면 OTC 시장 닫힘으로 오판할 수 있다.

**해결**: `isAssetUnavailable`로 실제 unavailable인 경우만 카운트

### Bug 4: CONSECUTIVE_UNAVAILABLE_THRESHOLD = 3이 너무 낮음

OTC 자산 목록에서 일부(2~3개)가 일시적으로 이용 불가한 것은 흔한 상황.
3개 연속이면 즉시 "시장 닫힘"으로 판단하고 5분 대기하는 것은 너무 성급하다.

**해결**: 임계값을 5로 상향 + 비OTC 자산도 불가인지 추가 확인

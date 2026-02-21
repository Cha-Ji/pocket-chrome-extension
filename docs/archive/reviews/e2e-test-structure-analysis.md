# E2E 테스트 구조 분석: LLM 자가검증 관점

> 분석일: 2026-02-07
> 목적: 바이브코딩 시 LLM이 자가검증을 효과적으로 수행할 수 있는 테스트 구조인지 평가

---

## 1. 종합 평가: ⚠️ 유닛 테스트는 양호, E2E/통합 테스트는 미흡

| 영역 | 상태 | LLM 자가검증 가능성 |
|------|------|---------------------|
| 유닛 테스트 (Vitest) | ✅ 양호 (44파일, ~9,700줄) | 높음 |
| E2E 테스트 (Playwright) | ❌ 사실상 미작동 (3파일, 대부분 skip/stub) | 없음 |
| 통합 테스트 | ❌ 부재 | 없음 |
| CI 파이프라인 | ⚠️ 유닛만 포함 | 중간 |
| Pre-commit 훅 | ❌ 없음 | 없음 |
| 테스트 실행 속도 | ❌ 매우 느림 (일부 테스트 2분+) | 낮음 |

---

## 2. E2E 테스트 현황: 사실상 비활성

### 2.1 파일별 상태

**`tests/e2e/example.spec.ts`** — 스텁 파일
- 5개 테스트 중 4개 `test.skip()`
- 유일한 활성 테스트: `expect(true).toBe(true)` (의미 없음)
- 로그인 필요하지만 인증 자동화 미구현

**`tests/e2e/extension.spec.ts`** — 구조만 존재
- 확장 프로그램 로드 + Pocket Option 접속 시도
- 로그인 벽/CAPTCHA에 막힘 → 실질적 검증 불가
- `return` 문으로 조기 종료되어 항상 pass

**`tests/e2e/offline-dom.spec.ts`** — 유일하게 의미있으나 Vitest여야 할 테스트
- Mock HTML로 DOM 파싱 검증
- Playwright가 아닌 Vitest 유닛 테스트로 옮기는 게 적합
- JSDOM 직접 사용 → Playwright의 이점 없음

### 2.2 Playwright 설정 분석

```typescript
// playwright.config.ts
baseURL: 'https://pocketoption.com'  // 외부 사이트 의존
// CI에서 E2E 미실행 (ci.yml에 playwright 미포함)
```

**근본적 한계**: 외부 상용 사이트에 의존하는 E2E는 재현성이 없음.

---

## 3. LLM 자가검증 관점에서의 핵심 문제

### 문제 1: ❌ E2E 피드백 루프 부재

LLM이 코드를 수정하면:
```
코드 수정 → npm test → 유닛 통과 ✅ → 실제 동작 검증? ❌
```

E2E가 작동하지 않으므로 **통합 수준의 회귀를 감지할 수 없음**.
예: content-script가 background에 메시지를 보내는 흐름이 깨져도 유닛 테스트는 통과함.

### 문제 2: ❌ 테스트 실행 시간이 너무 김

```
smma-simple.test.ts      → 126초 (2분+)
trend-following.test.ts  → 63초
leaderboard.test.ts      → 49초
```

LLM 바이브코딩에서 **빠른 피드백**이 핵심. `npm test` 한 번에 수 분씩 걸리면:
- LLM이 "수정 → 테스트 → 확인" 루프를 반복하기 어려움
- 토큰과 시간 낭비
- CI에서도 타임아웃 위험

### 문제 3: ❌ Pre-commit 훅 없음

LLM이 커밋 전에 자동으로 lint/type-check/test를 실행하는 게이트가 없음.
→ 깨진 코드가 커밋될 수 있음

### 문제 4: ⚠️ Chrome API 의존 코드 커버리지 0%

| 파일 | 커버리지 | 이유 |
|------|----------|------|
| `background/index.ts` | 0% | Chrome API mock 부족 |
| `content-script/index.ts` | 0% | Chrome API + DOM 의존 |
| `side-panel/App.tsx` | 0% | 전체 통합 컴포넌트 |

이 파일들이 **실제 확장 프로그램의 핵심 진입점**인데 테스트가 없음.

### 문제 5: ⚠️ 모듈 간 통합 테스트 부재

```
Content Script → (message) → Background → (DB) → Side Panel
```

이 파이프라인을 검증하는 테스트가 없음. 각 모듈은 독립적으로만 테스트됨.

---

## 4. 잘 되어 있는 부분

### ✅ 핵심 비즈니스 로직 유닛 테스트
- `indicators/` — 100% 커버리지, 741줄의 수학적 검증
- `backtest/strategies/` — 6개 전략 각각 266~338줄 테스트
- `errors/` — Result 패턴, 에러 핸들링 검증

### ✅ 테스트 헬퍼 & 데이터 생성기
- `test-helpers.ts` — Pre-computed 인디케이터로 성능 최적화
- `data-generator.ts` — 합성 캔들 데이터 생성

### ✅ CI 파이프라인 (유닛 범위)
```yaml
# .github/workflows/ci.yml
- Type check: npx tsc --noEmit
- Lint: npx eslint src
- Test: npx vitest run
- Build: npx vite build
```

### ✅ 커버리지 임계값 설정
```javascript
thresholds: {
  statements: 60,
  branches: 50,
  functions: 60,
  lines: 60,
}
```

---

## 5. 개선 권고사항 (우선순위순)

### P0: 테스트 실행 속도 개선 (즉시)

LLM 자가검증의 **가장 큰 병목**. 빠른 피드백 없이는 바이브코딩이 불가능.

```bash
# 현재: npm test → 3-5분+
# 목표: npm test → 30초 이내
```

**방법**:
- 느린 백테스트를 별도 test suite로 분리 (`test:fast`, `test:backtest`)
- 합성 데이터 크기 축소 (500 → 100캔들, 빠른 스모크 테스트용)
- `vitest --changed` 활용 (변경된 파일만 테스트)

```json
// package.json 제안
"test:fast": "vitest run --testPathPattern='(?!.*smma|.*trend-following|.*leaderboard)'",
"test:slow": "vitest run --testPathPattern='smma|trend-following|leaderboard'"
```

### P1: 모듈 간 통합 테스트 추가

Chrome API 없이도 모듈 간 메시지 흐름을 검증:

```typescript
// src/integration/__tests__/message-flow.test.ts
describe('Message Flow Integration', () => {
  it('content-script tick → background handler → DB 저장', async () => {
    // 1. data-collector가 tick 생성
    // 2. background message handler가 처리
    // 3. DB에 저장 확인
  })

  it('trading signal → executor 실행 → trade 기록', async () => {
    // signal-generator → auto-trader → executor mock → trade DB
  })
})
```

### P2: Offline E2E 테스트 전환

외부 사이트 의존을 제거하고, **로컬 HTML fixture** 기반으로 전환:

```typescript
// tests/e2e/offline/ 에 Pocket Option DOM 스냅샷 저장
// Playwright로 로컬 HTML 로드 → content script 로직 검증

test('should extract price from DOM snapshot', async ({ page }) => {
  await page.goto('file:///fixtures/pocket-option-chart.html')
  // content-script 로직 실행 → 결과 검증
})
```

### P3: Pre-commit 훅 추가

```bash
npx husky install
npx husky add .husky/pre-commit "npx tsc --noEmit && npx vitest run --changed"
```

LLM이 커밋할 때 자동으로 타입 체크 + 변경 파일 테스트 실행.

### P4: CI에 Coverage Threshold 강제

```yaml
# ci.yml에 추가
- name: Test with coverage
  run: npx vitest run --coverage
  # coverage threshold 미달 시 CI 실패
```

---

## 6. LLM 바이브코딩을 위한 이상적 테스트 구조

```
┌─────────────────────────────────────────────────┐
│ LLM 코드 수정                                   │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Layer 1: Fast Unit Tests (< 10초)               │ ← 현재 양호
│ - indicators, strategies, DB, types             │
│ - `npm run test:fast`                           │
└──────────────┬──────────────────────────────────┘
               │ 통과 시
               ▼
┌─────────────────────────────────────────────────┐
│ Layer 2: Integration Tests (< 30초)             │ ← ❌ 부재
│ - message flow, module 간 연동                  │
│ - Chrome API mock + 모듈 조합 테스트            │
└──────────────┬──────────────────────────────────┘
               │ 통과 시
               ▼
┌─────────────────────────────────────────────────┐
│ Layer 3: Offline E2E (< 60초)                   │ ← ❌ 미작동
│ - DOM fixture 기반 content-script 검증          │
│ - Side Panel React 렌더링 검증                  │
└──────────────┬──────────────────────────────────┘
               │ 통과 시
               ▼
┌─────────────────────────────────────────────────┐
│ Layer 4: Slow Backtest (별도 실행)              │ ← 현재 혼재
│ - 전략 성능 검증, 대량 데이터                   │
│ - `npm run test:slow`                           │
└─────────────────────────────────────────────────┘
```

---

## 7. 결론

**현재 구조의 LLM 자가검증 점수: 4/10**

| 기준 | 점수 | 설명 |
|------|------|------|
| 빠른 피드백 루프 | 2/10 | 느린 테스트가 전체를 블로킹 |
| 유닛 테스트 품질 | 8/10 | 비즈니스 로직 잘 커버 |
| 통합 테스트 | 1/10 | 사실상 없음 |
| E2E 테스트 | 1/10 | 스텁만 존재 |
| CI 게이트 | 5/10 | 유닛+타입+린트는 있으나 커버리지 미강제 |
| 커밋 전 검증 | 0/10 | Pre-commit 훅 없음 |

**가장 시급한 3가지**:
1. `test:fast` / `test:slow` 분리 → LLM 피드백 루프 속도 확보
2. 모듈 간 통합 테스트 추가 → 메시지 흐름 회귀 방지
3. Pre-commit 훅 → 커밋 전 자동 검증 게이트

# Test Coverage Report

**날짜:** 2026-01-29  
**테스트 프레임워크:** Vitest + React Testing Library

## 📊 Overall Coverage Summary

| Metric | Coverage | Count |
|--------|----------|-------|
| **Statements** | 60.19% | 605/1005 |
| **Branches** | 86.87% | 139/160 |
| **Functions** | 70.14% | 47/67 |
| **Lines** | 60.19% | 605/1005 |

## ✅ Test Suites (10 files, 78 tests)

| Test File | Tests | Status |
|-----------|-------|--------|
| `indicators.test.ts` | 16 | ✅ Pass |
| `db.test.ts` | 11 | ✅ Pass |
| `executor.test.ts` | 9 | ✅ Pass |
| `ControlPanel.test.tsx` | 9 | ✅ Pass |
| `data-collector.test.ts` | 8 | ✅ Pass |
| `StatusCard.test.tsx` | 7 | ✅ Pass |
| `useLogs.test.ts` | 7 | ✅ Pass |
| `LogViewer.test.tsx` | 6 | ✅ Pass |
| `types.test.ts` | 3 | ✅ Pass |
| `background.test.ts` | 2 | ✅ Pass |

## 📁 Coverage by Module

### ✅ High Coverage (>80%)

| Module | Statements | Branches | Functions |
|--------|------------|----------|-----------|
| `lib/indicators` | 100% | 93.61% | 100% |
| `lib/types` | 100% | 100% | 100% |
| `lib/db` | 84.25% | 80.95% | 68% |
| `side-panel/components/*` | 100% | 100% | 100% |
| `side-panel/hooks/useLogs` | 100% | 100% | 100% |

### ⚠️ Medium Coverage (40-80%)

| Module | Statements | Notes |
|--------|------------|-------|
| `content-script/data-collector.ts` | 53.19% | DOM interaction stubs (로그인 필요) |
| `content-script/executor.ts` | 60.67% | Trade execution stubs (로그인 필요) |

### ❌ Low Coverage (<40%)

| Module | Statements | Reason |
|--------|------------|--------|
| `background/index.ts` | 0% | Chrome API 의존성 (통합 테스트 필요) |
| `content-script/index.ts` | 0% | Chrome API 의존성 |
| `side-panel/App.tsx` | 0% | 통합 컴포넌트 (E2E 테스트 필요) |
| `side-panel/hooks/useTradingStatus.ts` | 0% | Chrome API 의존성 |

## 🎯 Coverage Thresholds

현재 설정된 임계값:
```javascript
thresholds: {
  statements: 60,  // ✅ 60.19% (PASS)
  branches: 50,    // ✅ 86.87% (PASS)
  functions: 60,   // ✅ 70.14% (PASS)
  lines: 60,       // ✅ 60.19% (PASS)
}
```

## 📝 테스트 카테고리

### Unit Tests (완료)
- [x] Technical Indicators (SMA, EMA, RSI, BB, MACD)
- [x] Database Operations (CRUD for all tables)
- [x] Type Definitions
- [x] React Components (StatusCard, ControlPanel, LogViewer)
- [x] React Hooks (useLogs)
- [x] Content Script Classes (DataCollector, TradeExecutor)

### Integration Tests (부분 완료)
- [x] Database Repository Integration
- [ ] Background ↔ Content Script Communication
- [ ] Side Panel ↔ Background Communication

### E2E Tests (대기)
- [ ] Extension Loading
- [ ] Data Collection (로그인 필요)
- [ ] Trade Execution (로그인 필요)
- [ ] Side Panel UI Flow

## 🔧 커버리지 개선 계획

1. **로그인 후 구현될 테스트:**
   - Content Script DOM 인터랙션
   - 실제 데이터 수집 검증
   - 자동매매 실행 테스트

2. **추가 예정 테스트:**
   - `useTradingStatus` hook (Chrome API mock 개선)
   - `App.tsx` 통합 테스트
   - Background Service Worker 통합 테스트

## 📈 명령어

```bash
# 테스트 실행
npm test

# 커버리지 측정
npm run test:coverage

# Watch 모드
npm test -- --watch

# 특정 파일만 테스트
npm test -- indicators
```

## 📂 Coverage HTML 리포트

`coverage/index.html`에서 상세 리포트 확인 가능

# Repository Review: Improvement Issues

> **Review Date**: 2026-02-07
> **Reviewer**: Claude Code (automated review)
> **Scope**: Full codebase review - architecture, security, code quality, testing, performance

아래 이슈들은 코드베이스 전체를 분석한 결과 발견된 개선점입니다.
우선순위: `P0` (긴급) > `P1` (높음) > `P2` (보통) > `P3` (낮음)

---

## Issue #1: [bug][P0] 거래 실행 시 금액 입력값 검증 누락

**Label**: `bug`
**우선순위**: 긴급 (서비스 장애)

### 증상
`executor.ts`의 `execute(direction, amount)` 함수에 금액 검증 로직이 없어서 `NaN`, 음수, 또는 비정상적으로 큰 금액이 전달될 수 있음.

### 원인
- `src/lib/platform/adapters/pocket-option/executor.ts` - `execute()` 함수에 amount 파라미터 검증 없음
- 상위 호출 체인(`auto-trader.ts` → `executor.ts`)에서도 검증 누락

### 해결 방안
```typescript
// executor.ts - execute() 시작부에 추가
if (!Number.isFinite(amount) || amount <= 0) {
  throw new POError('INVALID_TRADE_AMOUNT', { amount });
}
if (amount > MAX_TRADE_AMOUNT) {  // 설정 가능한 상한선
  throw new POError('TRADE_AMOUNT_EXCEEDS_LIMIT', { amount, limit: MAX_TRADE_AMOUNT });
}
```

### 영향 범위
- `src/lib/platform/adapters/pocket-option/executor.ts`
- `src/lib/trading/auto-trader.ts`

---

## Issue #2: [bug][P0] Background에서 거래 기록 미저장 (TODO 미구현)

**Label**: `bug`
**우선순위**: 긴급 (기능 장애)

### 증상
거래 실행 후 결과가 DB에 기록되지 않아 거래 내역 추적 불가.

### 원인
- `src/background/index.ts` ~248행: `// TODO: Record trade in database` 주석만 존재
- 실제 DB 저장 로직 미구현

### 해결 방안
- `TradeRepository`를 사용하여 `handleTradeResult` 핸들러에서 거래 결과 저장
- 저장 실패 시 retry 로직 또는 에러 알림 추가

### 영향 범위
- `src/background/index.ts`
- `src/lib/db/` (TradeRepository)

---

## Issue #3: [bug][P1] WebSocket Bridge 메시지 출처 검증 부재

**Label**: `bug`, `security`
**우선순위**: 높음 (기능 장애)

### 증상
`window.postMessage`로 수신하는 WebSocket 데이터의 `event.origin` 검증이 없어, 악성 스크립트가 가짜 가격 데이터를 주입할 수 있음.

### 원인
- `src/content-script/websocket-interceptor.ts`의 `handleBridgeMessage()`에서 `event.source`, `event.origin` 검증 누락

### 해결 방안
```typescript
window.addEventListener('message', (event) => {
  // origin 검증 추가
  if (event.origin !== window.location.origin) return;
  if (event.data?.source !== 'pq-bridge') return;
  // ...
});
```

### 영향 범위
- `src/content-script/websocket-interceptor.ts`
- `scripts/tampermonkey/inject-websocket.user.js`

---

## Issue #4: [bug][P1] Signal 실행 시 Race Condition - 동시 거래 가능

**Label**: `bug`
**우선순위**: 높음 (기능 장애)

### 증상
`setupSignalHandler()`에서 `executeSignal()`이 await 없이 호출되어, 빠르게 연속 시그널이 발생하면 복수 거래가 동시 실행될 수 있음.

### 원인
- Signal 실행이 비동기지만 동시 실행 제어(mutex/lock)가 없음
- Content script에서 시그널 핸들러의 await 누락

### 해결 방안
- 거래 실행 중 플래그(`isExecuting`) 또는 mutex 패턴 도입
- 동시 실행 시도 시 큐잉 또는 무시 처리

### 영향 범위
- `src/content-script/index.ts`
- `src/lib/trading/auto-trader.ts`

---

## Issue #5: [bug][P1] DB Write 실패 시 Tick 데이터 무손실 유실

**Label**: `bug`
**우선순위**: 높음 (기능 장애)

### 증상
`handleTickData()`에서 DB 저장 실패 시 에러를 무시(`catch(() => {})`)하여 가격 데이터가 영구 유실됨.

### 원인
- `src/background/index.ts` ~241-242행: `.catch(() => {})` 패턴

### 해결 방안
- 저장 실패 시 메모리 버퍼에 보관 후 재시도
- 연속 실패 시 에러 알림 (Telegram 또는 UI)
- 최소한 `console.error`로 에러 로깅

### 영향 범위
- `src/background/index.ts`

---

## Issue #6: [refactor][P1] `any` 타입 193개 제거 - TypeScript 타입 안전성 강화

**Label**: `refactor`
**우선순위**: 높음

### 현재 문제
코드베이스 전반에 `any` 타입이 193회 사용되어 TypeScript의 타입 안전성이 크게 저하됨. 런타임 타입 에러 디버깅이 어려움.

### 개선 목표
- 모든 `any`를 구체적 타입으로 교체
- `tsconfig.json`에서 `noImplicitAny: true` 활성화
- `noUnusedLocals: true`, `noUnusedParameters: true` 활성화

### 주요 대상 파일
| 파일 | `any` 사용 | 설명 |
|------|-----------|------|
| `lib/logger/` | `...args: any[]` | `unknown[]`으로 교체 |
| `lib/signals/` | `notifySignal(signal: any)` | Signal 인터페이스 정의 |
| `content-script/websocket-parser.ts` | `detect: (data: any)` | `ParsedMessage` 타입 사용 |
| `background/index.ts` | 메시지 핸들러 | `MessagePayload` union type 정의 |

### 영향 범위
- 전체 `src/` 디렉토리 (~30+ 파일)

### 롤백 계획
- 점진적 교체: 모듈별 브랜치에서 진행, 테스트 통과 확인 후 머지

---

## Issue #7: [refactor][P1] Signal Generator 중복 버전 정리 (v1/v2/v3)

**Label**: `refactor`
**우선순위**: 높음

### 현재 문제
4개의 시그널 생성기 파일이 공존하여 어떤 것이 활성 버전인지 불분명:
- `signal-generator.ts` (v1)
- `signal-generator-v2.ts`
- `strategies-v2.ts`
- `strategies-v3.ts`

### 개선 목표
- 활성 버전 하나로 통합
- 미사용 버전은 `deprecated/` 폴더로 이동 또는 삭제
- 전략 등록 패턴을 Strategy Pattern으로 통일

### 영향 범위
- `src/lib/signals/` 디렉토리 전체
- 이를 참조하는 `content-script/index.ts`, `background/index.ts`

### 롤백 계획
- 기존 파일은 git history에 보존
- 통합 전 테스트 커버리지 확보

---

## Issue #8: [refactor][P2] console.log 490건 정리 - 구조화된 로깅 시스템 적용

**Label**: `refactor`
**우선순위**: 보통

### 현재 문제
코드베이스에 `console.log/warn/error` 490건 산재. 개발용 로그가 프로덕션에 노출되며, 로그 레벨/필터링 불가.

### 개선 목표
- `src/lib/logger/`의 기존 로거 모듈을 활용하여 전체 교체
- 로그 레벨 (DEBUG, INFO, WARN, ERROR) 적용
- 프로덕션 빌드에서 DEBUG 로그 자동 제거 (tree-shaking 또는 build flag)

### 영향 범위
- 전체 `src/` 디렉토리

### 롤백 계획
- 모듈별 점진적 교체

---

## Issue #9: [bug][P2] 메모리 누수 - WebSocket 버퍼/캔들 맵 무한 성장

**Label**: `bug`, `performance`
**우선순위**: 보통

### 증상
장시간 실행 시 메모리 사용량이 지속 증가할 수 있음.

### 원인
1. `WebSocketInterceptor.messageBuffer`: `maxBufferSize=1000`이지만 정리 로직 미구현
2. `candleCollector.candles`: Map이 무한 성장, 오래된 캔들 정리 없음
3. `websocket-interceptor.connections`: Map 정리 없음

### 해결 방안
- Ring buffer 패턴 도입 (FIFO, 최대 크기 초과 시 오래된 항목 제거)
- 캔들 맵에 TTL 또는 최대 크기 적용
- WebSocket 연결 종료 시 connections Map에서 제거

### 영향 범위
- `src/content-script/websocket-interceptor.ts`
- `src/lib/` (candle collector)

---

## Issue #10: [bug][P2] Selector Cache 무효화 누락 - DOM 변경 시 stale 셀렉터 사용

**Label**: `bug`
**우선순위**: 보통

### 증상
Pocket Option 사이트의 DOM 구조 변경 시, 캐시된 셀렉터가 무효화되지 않아 거래 실행 실패.

### 원인
- `PocketOptionExecutor.selectorCache`가 한번 설정되면 영구 유지
- DOM 변경 감지 메커니즘 없음

### 해결 방안
- 셀렉터 사용 전 요소 존재 여부 재확인
- MutationObserver로 주요 컨테이너 변경 감지 시 캐시 무효화
- 또는 TTL 기반 캐시 (예: 30초마다 갱신)

### 영향 범위
- `src/lib/platform/adapters/pocket-option/executor.ts`
- `src/lib/platform/adapters/pocket-option/selectors.ts`

---

## Issue #11: [enhancement][P2] 테스트 커버리지 확대 - 현재 ~34% → 목표 80%

**Label**: `enhancement`, `testing`
**우선순위**: 보통

### 목표
핵심 모듈의 테스트 커버리지를 80% 이상으로 향상.

### 요구사항
현재 테스트 커버리지 갭:

| 모듈 | 현재 상태 | 필요한 테스트 |
|------|-----------|--------------|
| `content-script/` | 5개 테스트 파일 | 통합 테스트, WebSocket 파서 테스트 |
| `auto-trader.ts` | 제한적 | E2E 거래 플로우 테스트 |
| `executor.ts` | 미흡 | DOM 인터랙션 모킹 테스트 |
| `background/index.ts` | 미흡 | 메시지 핸들러 단위 테스트 |
| `websocket-interceptor.ts` | 미흡 | 메시지 파싱/디스패치 테스트 |

### 완료 조건
- [ ] content-script 통합 테스트 추가
- [ ] auto-trader E2E 테스트 추가
- [ ] executor DOM 모킹 테스트 추가
- [ ] background 메시지 핸들러 테스트 추가
- [ ] WebSocket 파서 comprehensive 테스트
- [ ] `npm run test:coverage` 실행 시 80% 이상

---

## Issue #12: [enhancement][P2] Demo Mode 안전 체크 강화

**Label**: `enhancement`, `security`
**우선순위**: 보통

### 목표
데모 모드 확인 로직을 강화하여 실제 거래 방지를 더 확실히 보장.

### 요구사항
현재 3중 체크가 모두 DOM 기반이라 스푸핑 가능성 있음:
1. URL 파라미터 확인
2. Chart 요소 클래스 확인
3. 잔액 라벨 텍스트 확인

### 개선안
- 서버 응답(WebSocket 메시지)에서 계정 타입 확인 추가
- 체크 실패 시 자동 거래 즉시 중단 + 알림
- 주기적 재검증 (30초마다)
- 체크 결과 로깅

### 완료 조건
- [ ] WebSocket 기반 계정 타입 확인 추가
- [ ] 주기적 재검증 타이머 구현
- [ ] 실패 시 자동 중단 + 알림 구현
- [ ] 테스트 작성

---

## Issue #13: [refactor][P2] 에러 처리 패턴 통일

**Label**: `refactor`
**우선순위**: 보통

### 현재 문제
에러 처리 방식이 혼재:
- 일부 함수: `throw new Error()` / `throw new POError()`
- 일부 함수: `return { success: false, error: ... }`
- 일부 함수: `.catch(() => {})` (silent fail)

### 개선 목표
- `Result<T, E>` 패턴 또는 일관된 에러 처리 규칙 정의
- Silent fail 전면 제거
- `POError` 클래스를 모든 에러에 통일 적용

### 영향 범위
- 전체 `src/` 디렉토리
- 특히 `background/index.ts`, `executor.ts`, `auto-trader.ts`

### 롤백 계획
- 모듈별 점진적 교체, 각 모듈 교체 후 테스트 검증

---

## Issue #14: [refactor][P2] Content Script 관심사 분리

**Label**: `refactor`
**우선순위**: 보통

### 현재 문제
`src/content-script/index.ts`에 여러 책임이 혼재:
- 데이터 수집 (DOM 파싱)
- WebSocket 핸들링
- 거래 실행
- 시그널 처리
- 상태 관리

### 개선 목표
- 각 책임을 독립 모듈로 분리
- 명확한 의존성 그래프 구성
- 초기화 순서를 dependency injection 패턴으로 관리

### 영향 범위
- `src/content-script/` 전체

### 롤백 계획
- 리팩토링 전 테스트 커버리지 확보 (Issue #11 선행)

---

## Issue #15: [enhancement][P3] README.md 작성

**Label**: `enhancement`, `documentation`
**우선순위**: 낮음

### 목표
프로젝트 소개, 설치 가이드, 사용법을 포함한 README.md 작성.

### 요구사항
- [ ] 프로젝트 개요 및 스크린샷
- [ ] 설치 방법 (npm install, Chrome Extension 로드)
- [ ] Tampermonkey 스크립트 설정 방법
- [ ] 개발 환경 설정 (npm run dev, test, build)
- [ ] 아키텍처 다이어그램
- [ ] Contributing 가이드
- [ ] 라이선스

---

## Issue #16: [refactor][P3] 글로벌 뮤터블 상태 → 상태 관리 시스템 도입

**Label**: `refactor`
**우선순위**: 낮음

### 현재 문제
`minerState`, `tradingStatus`, `tradingConfig` 등이 모듈 레벨 전역 변수로 관리되어:
- 상태 변경 추적 어려움
- 동시 접근 시 race condition 위험
- 테스트 시 상태 격리 어려움

### 개선 목표
- Zustand 또는 간단한 Store 패턴 도입
- 상태 변경을 이벤트로 추적 가능
- 테스트에서 상태 격리 용이하게

### 영향 범위
- `src/background/` (상태 관리)
- `src/content-script/` (상태 참조)

### 롤백 계획
- 기존 전역 변수를 Store 래퍼로 감싸는 방식으로 점진적 전환

---

## Issue #17: [enhancement][P3] DOM 셀렉터 자동 검증 및 알림 시스템

**Label**: `enhancement`
**우선순위**: 낮음

### 목표
Pocket Option 사이트 업데이트로 DOM 셀렉터가 깨질 때 즉시 감지하고 알림.

### 요구사항
- [ ] 확장 로드 시 모든 필수 셀렉터 검증
- [ ] 셀렉터 실패 시 UI 경고 표시
- [ ] 셀렉터 버전 관리 (fallback 체인 개선)
- [ ] Telegram 알림 옵션

### 기술 스택
- 기존 `selectors.ts` 확장
- MutationObserver 활용

---

## Issue #18: [enhancement][P3] Candle 데이터 벌크 인서트 성능 최적화

**Label**: `enhancement`, `performance`
**우선순위**: 낮음

### 목표
`CandleRepository.bulkAdd()`의 성능 개선.

### 현재 문제
- 각 캔들마다 개별 DB 쿼리 수행 (234-244행)
- 대량 데이터 삽입 시 병목

### 요구사항
- Dexie.js의 `bulkPut()` 활용하여 배치 처리
- 중복 체크를 DB 레벨(unique index)로 위임

---

## 우선순위 요약

| 우선순위 | 이슈 | 유형 |
|---------|------|------|
| **P0** | #1 거래 금액 검증 누락 | bug |
| **P0** | #2 거래 기록 미저장 | bug |
| **P1** | #3 WebSocket 메시지 출처 미검증 | bug/security |
| **P1** | #4 Signal 동시 실행 Race Condition | bug |
| **P1** | #5 DB Write 실패 시 데이터 유실 | bug |
| **P1** | #6 `any` 타입 193개 제거 | refactor |
| **P1** | #7 Signal Generator 중복 정리 | refactor |
| **P2** | #8 console.log 490건 정리 | refactor |
| **P2** | #9 메모리 누수 (버퍼/맵 무한 성장) | bug/performance |
| **P2** | #10 Selector Cache 무효화 누락 | bug |
| **P2** | #11 테스트 커버리지 확대 | enhancement |
| **P2** | #12 Demo Mode 안전 체크 강화 | enhancement/security |
| **P2** | #13 에러 처리 패턴 통일 | refactor |
| **P2** | #14 Content Script 관심사 분리 | refactor |
| **P3** | #15 README.md 작성 | documentation |
| **P3** | #16 글로벌 상태 → 상태 관리 시스템 | refactor |
| **P3** | #17 DOM 셀렉터 자동 검증 | enhancement |
| **P3** | #18 Candle 벌크 인서트 최적화 | performance |

---

## 권장 실행 순서

1. **1차 (안전 최우선)**: Issue #1, #2, #3, #4 - 거래 안전성 확보
2. **2차 (안정성)**: Issue #5, #9, #10 - 데이터 무결성 및 메모리 관리
3. **3차 (코드 품질)**: Issue #6, #7, #8, #13 - 타입 안전성 및 코드 정리
4. **4차 (테스트)**: Issue #11 - 리팩토링 전 테스트 기반 확보
5. **5차 (리팩토링)**: Issue #14, #16 - 아키텍처 개선
6. **6차 (부가)**: Issue #12, #15, #17, #18 - 기능 강화 및 문서화

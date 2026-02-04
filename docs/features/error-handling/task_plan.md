# Error Handling Module - Task Plan

## Phase 1: Core Error Infrastructure

- [x] 1.1 `POError` 커스텀 에러 클래스 생성
  - [x] ErrorCode enum 정의 (NETWORK, DB, TRADE, VALIDATION, DOM, UNKNOWN)
  - [x] 에러 컨텍스트 인터페이스 (module, function, data)
  - [x] cause 체이닝 지원 (원인 에러 추적)
  - [x] 스택 트레이스 파싱 유틸리티

- [x] 1.2 `ErrorContext` 타입 정의
  - [x] module: 에러 발생 모듈 (background, content-script, side-panel, lib)
  - [x] function: 에러 발생 함수명
  - [x] path: 에러 전파 경로 배열
  - [x] timestamp: 발생 시각
  - [x] extra: 추가 디버그 정보

- [x] 1.3 `Result<T, E>` 타입 정의
  - [x] Success/Failure 유니온 타입
  - [x] map, flatMap, unwrap 유틸리티

## Phase 2: Error Handler Service

- [x] 2.1 중앙 에러 핸들러 생성 (`src/lib/errors/handler.ts`)
  - [x] 에러 로깅 표준화 (포맷팅, 레벨)
  - [x] 에러 히스토리 저장 (최근 N개)
  - [x] 에러 통계 (발생 횟수, 패턴)

- [x] 2.2 에러 리포터 (handler.ts에 통합)
  - [x] console 출력 포맷터
  - [x] 텔레그램 알림 통합 (background에서 listener로)
  - [ ] IndexedDB 에러 로그 저장 (향후)

- [x] 2.3 에러 복구 전략 (`src/lib/errors/utils.ts`)
  - [x] 재시도 로직 (지수 백오프) - `retry()`
  - [x] 타임아웃 래퍼 - `withTimeout()`

## Phase 3: Module Integration

- [x] 3.1 Background Service Worker 통합
  - [x] 메시지 핸들러 에러 래핑
  - [x] DB 작업 에러 처리
  - [x] 전역 에러 핸들러 등록 (Telegram 알림)

- [x] 3.2 Content Script 통합
  - [x] 거래 실행 에러 개선 (executor.ts)
  - [ ] DOM 파싱 에러 처리 (향후)
  - [ ] 메시지 전송 에러 처리 (향후)

- [x] 3.3 Side Panel UI 통합
  - [x] ErrorBoundary 개선
  - [x] 에러 상태 표시 컴포넌트
  - [x] 에러 히스토리 뷰어

## Phase 4: Developer Experience

- [x] 4.1 에러 유틸리티 함수
  - [x] `tryCatchAsync()` - 비동기 함수 에러 래핑
  - [x] `tryCatch()` - 동기 함수 에러 래핑
  - [x] `assertDefined()` - null/undefined 체크
  - [x] `queryElement()` - DOM 요소 조회
  - [x] `retry()` - 재시도 래퍼
  - [x] `withTimeout()` - 타임아웃 래퍼

- [ ] 4.2 디버그 도구 (향후)
  - [ ] 에러 경로 시각화
  - [ ] 스택 트레이스 소스맵 지원
  - [ ] 에러 발생 컨텍스트 스냅샷

## Phase 5: Testing & Documentation

- [x] 5.1 테스트 작성
  - [x] POError 단위 테스트 (28 tests)
  - [x] Result 단위 테스트 (33 tests)
  - [x] ErrorHandler 단위 테스트 (16 tests)
  - [ ] 통합 테스트 시나리오 (향후)

- [x] 5.2 문서화
  - [x] 3-file pattern 문서 작성
  - [ ] 에러 코드 레퍼런스 (향후)
  - [ ] 사용 가이드 (향후)
  - [ ] 마이그레이션 가이드 (향후)

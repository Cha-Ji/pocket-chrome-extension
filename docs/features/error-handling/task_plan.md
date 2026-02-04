# Error Handling Module - Task Plan

## Phase 1: Core Error Infrastructure

- [ ] 1.1 `POError` 커스텀 에러 클래스 생성
  - [ ] ErrorCode enum 정의 (NETWORK, DB, TRADE, VALIDATION, DOM, UNKNOWN)
  - [ ] 에러 컨텍스트 인터페이스 (module, function, data)
  - [ ] cause 체이닝 지원 (원인 에러 추적)
  - [ ] 스택 트레이스 파싱 유틸리티

- [ ] 1.2 `ErrorContext` 타입 정의
  - [ ] module: 에러 발생 모듈 (background, content-script, side-panel, lib)
  - [ ] function: 에러 발생 함수명
  - [ ] path: 에러 전파 경로 배열
  - [ ] timestamp: 발생 시각
  - [ ] extra: 추가 디버그 정보

- [ ] 1.3 `Result<T, E>` 타입 정의
  - [ ] Success/Failure 유니온 타입
  - [ ] map, flatMap, unwrap 유틸리티

## Phase 2: Error Handler Service

- [ ] 2.1 중앙 에러 핸들러 생성 (`src/lib/errors/handler.ts`)
  - [ ] 에러 로깅 표준화 (포맷팅, 레벨)
  - [ ] 에러 히스토리 저장 (최근 N개)
  - [ ] 에러 통계 (발생 횟수, 패턴)

- [ ] 2.2 에러 리포터 (`src/lib/errors/reporter.ts`)
  - [ ] console 출력 포맷터
  - [ ] 텔레그램 알림 통합
  - [ ] IndexedDB 에러 로그 저장

- [ ] 2.3 에러 복구 전략 (`src/lib/errors/recovery.ts`)
  - [ ] 재시도 로직 (지수 백오프)
  - [ ] 폴백 전략 인터페이스

## Phase 3: Module Integration

- [ ] 3.1 Background Service Worker 통합
  - [ ] 메시지 핸들러 에러 래핑
  - [ ] DB 작업 에러 처리
  - [ ] 전역 에러 핸들러 등록

- [ ] 3.2 Content Script 통합
  - [ ] 거래 실행 에러 개선
  - [ ] DOM 파싱 에러 처리
  - [ ] 메시지 전송 에러 처리

- [ ] 3.3 Side Panel UI 통합
  - [ ] ErrorBoundary 개선
  - [ ] 에러 상태 표시 컴포넌트
  - [ ] 에러 히스토리 뷰어

## Phase 4: Developer Experience

- [ ] 4.1 에러 유틸리티 함수
  - [ ] `wrapAsync()` - 비동기 함수 에러 래핑
  - [ ] `tryCatch()` - 동기 함수 에러 래핑
  - [ ] `assertDefined()` - null/undefined 체크

- [ ] 4.2 디버그 도구
  - [ ] 에러 경로 시각화
  - [ ] 스택 트레이스 소스맵 지원
  - [ ] 에러 발생 컨텍스트 스냅샷

## Phase 5: Testing & Documentation

- [ ] 5.1 테스트 작성
  - [ ] POError 단위 테스트
  - [ ] ErrorHandler 단위 테스트
  - [ ] 통합 테스트 시나리오

- [ ] 5.2 문서화
  - [ ] 에러 코드 레퍼런스
  - [ ] 사용 가이드
  - [ ] 마이그레이션 가이드 (기존 코드 → 새 패턴)

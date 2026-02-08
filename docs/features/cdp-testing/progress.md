# CDP Testing 진행 로그

## 2026-02-08 — Phase 1.5: Tampermonkey-free 마이닝 테스트

### 문제 발견
- 기존 E2E 테스트(mining-diagnostic)는 마이닝 파이프라인을 실제로 테스트하지 못함
- `websocket-interceptor.ts:56`에서 Extension 자체 WS Hook이 `return;`으로 비활성화
- Tampermonkey 없이는 `interceptor.send()`가 사일런트 실패 (에러 없이 데이터 0)

### 해결 구현
- `tests/e2e/helpers/ws-bridge-injector.ts` 생성
  - CDP `Page.addScriptToEvaluateOnNewDocument`로 Main World에 WS Hook 자동 주입
  - Tampermonkey의 inject-websocket.user.js 핵심 로직을 독립 실행 가능하게 재구성
  - 로깅 접두사 `[CDP-Bridge]`로 Tampermonkey `[TM-Spy]`와 구분
- `cdp-diagnostic.spec.ts` 업데이트
  - Step 1에서 `injectWSBridge(cdp)` 호출 후 page.goto()
  - Step 4에서 5-stage 파이프라인 검증 (WS요청→WS응답→파서→API→DB)
  - console-monitor + CDP 교차 검증 (파서 버그 자동 탐지)

## 2026-02-08 — Phase 1 구현 완료

### 완료 항목
- `tests/e2e/helpers/cdp-inspector.ts` 생성
  - WebSocket 프레임 캡처 (Network 도메인)
  - Socket.IO 이벤트 파싱
  - localhost:3001 API 호출 감시
  - JS 예외 자동 수집 (Runtime 도메인)
  - 성능 메트릭 스냅샷 (Performance 도메인)
  - LLM 소비용 구조화 리포트 생성
- `tests/e2e/cdp-diagnostic.spec.ts` 생성
  - 6단계 진단 테스트 (서버체크 → WS연결 → 프레임수신 → 교차검증 → API검증 → 메모리/예외)
  - 기존 mining-diagnostic 패턴 유지하면서 CDP 레이어 추가
- `playwright.config.ts` 업데이트 — cdp-diagnostic 프로젝트 추가
- `package.json` 업데이트 — `test:e2e:cdp` 스크립트 추가
- 3-file 문서화 완료

### 설계 포인트
- Playwright 내장 CDP 세션 사용 (의존성 제로)
- 기존 extension-context, server-checker 헬퍼 재사용
- console-monitor와 독립적으로 동작 (공존 가능)

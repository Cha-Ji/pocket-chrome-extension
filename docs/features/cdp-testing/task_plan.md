# CDP Testing 도입 태스크 플랜

## 목표
Chrome DevTools Protocol을 활용하여 LLM이 파이프라인을 더 정확하게 테스트/디버깅할 수 있도록 E2E 진단 인프라를 강화한다.

## 체크리스트

### Phase 1: 기본 인프라 (현재)
- [x] CDP Inspector 헬퍼 구현 (`tests/e2e/helpers/cdp-inspector.ts`)
- [x] CDP 기반 진단 테스트 구현 (`tests/e2e/cdp-diagnostic.spec.ts`)
- [x] Playwright 설정에 cdp-diagnostic 프로젝트 추가
- [x] npm script 추가 (`test:e2e:cdp`)
- [x] 3-file 문서화

### Phase 2: 고급 기능 (후속)
- [ ] Service Worker CDP 세션 연결 (Background 상태 직접 조회)
- [ ] DOM 셀렉터 자동 복구 (DOM.querySelector 기반)
- [ ] 메모리 누수 트렌드 추적 (다중 스냅샷 비교)
- [ ] WS 프레임 레코딩/리플레이 (오프라인 테스트용)

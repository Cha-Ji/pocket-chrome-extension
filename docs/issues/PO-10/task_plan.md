# Task Plan - [Data] WebSocket Interceptor를 통한 실시간 가격 데이터 수집 (PO-10)

## 🎯 목표
Pocket Option 사이트의 WebSocket 연결을 가로채서 실시간 가격 데이터를 수집하고, 이를 기존 CandleCollector와 통합하여 더 정확한 가격 정보를 확보함.

## 📋 작업 목록

### Phase 1: 코드 통합
- [x] WebSocket interceptor 모듈 생성 (`websocket-interceptor.ts`)
- [x] WebSocket parser 모듈 생성 (`websocket-parser.ts`)
- [x] Inject script 생성 (`inject-websocket.ts`)
- [x] Content Script에 WebSocket 핸들러 통합

### Phase 2: 빌드 설정
- [x] `vite.config.ts` 업데이트 (inject-websocket.js 별도 빌드)
- [x] `manifest.json` 업데이트 (web_accessible_resources 추가)

### Phase 3: 메시지 처리
- [x] Background script에 WebSocket 관련 메시지 타입 추가
- [ ] Side Panel에서 WebSocket 상태 표시 (선택 - 향후 구현)

### Phase 4: 검증
- [x] TypeScript 빌드 검증
- [x] 단위 테스트 작성 (websocket-parser) - 20개 테스트 통과

### Phase 5: 완료
- [x] 커밋 및 푸시
- [ ] PR 병합 또는 완료 확인

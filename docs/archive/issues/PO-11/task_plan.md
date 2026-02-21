# Task Plan - [Data] 실시간 데이터 수집 개선 및 Forward Test (PO-11)

## 🎯 목표

Pocket Option에서 실시간 가격 데이터를 안정적으로 수집하고, Forward Test로 전략 검증을 완료하여 자동 매매 시스템의 신뢰성을 확보한다.

## 📋 단계별 체크리스트

### Phase 1: 현황 분석 및 개선점 도출
- [x] 기존 CandleCollector/DataCollector 코드 분석
- [x] DOM 셀렉터 유효성 검증 (Pocket Option 현재 구조)
- [x] WebSocket 연결 가능성 조사
- [ ] 가격 수집 안정성 테스트

### Phase 2: 데이터 수집 개선
- [ ] DOM 셀렉터 업데이트 (필요시)
- [ ] 폴링 간격 최적화 (현재 500ms)
- [ ] 에러 복구 로직 강화
- [ ] 가격 데이터 검증 로직 추가

### Phase 3: 페이지 인디케이터 읽기 개선
- [x] RSI 셀렉터 검증 및 수정
- [x] Stochastic 셀렉터 검증 및 수정
- [x] 인디케이터 값 정확도 검증 (테스트 24개 추가)
- [ ] 계산된 값 vs 페이지 값 비교 로직

### Phase 4: Forward Test 시스템
- [x] Forward Test 스크립트 분석 (scripts/forward-test.ts)
- [x] Forward Test V2로 업그레이드 (Stochastic 제외, RSI/EMA만 사용)
- [x] 승률 자동 계산 및 리포트 (전략별/시장상태별 통계)
- [ ] 최소 20회 거래로 전략 검증 (실전 테스트 대기)

### Phase 5: 테스트 및 문서화
- [ ] 단위 테스트 추가/업데이트
- [ ] E2E 테스트 시나리오 작성
- [ ] progress.md 최종 업데이트
- [ ] PR 준비 및 커밋

## 📊 성공 기준

1. **가격 수집 안정성**: 10분간 연속 수집 시 누락률 < 1%
2. **인디케이터 정확도**: 페이지 값과 수집 값 오차 < 5%
3. **Forward Test 완료**: 최소 20회 거래, 승률 52%+ 달성
4. **시스템 가용성**: healthCheck() 결과 'healthy' 유지

## 🔗 관련 파일

- `src/content-script/candle-collector.ts`
- `src/content-script/data-collector.ts`
- `src/content-script/indicator-reader.ts`
- `src/content-script/index.ts`
- `scripts/forward-test.ts`

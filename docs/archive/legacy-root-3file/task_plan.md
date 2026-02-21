# 작업 계획

## 단계별 체크리스트

- [x] 조사 및 범위 확정 (현행 에러 처리/로그 패턴 스캔)
- [x] 구현 계획 수립 (errors 모듈 설계, 통합 지점, 테스트 범위)
- [x] 코드 변경
- [ ] 검증/테스트
- [x] 마무리 정리

## 2026-02-21 Real URL 마이그레이션 점검

- [x] `collect:xvfb`를 real URL(`.../cabinet/quick-high-low/`)로 직접 실행해 실패 지점 재현
- [x] 실패 원인 분리: 프로필 lock 충돌 vs 로그인 리다이렉트 vs URL 도메인 매칭 누락
- [x] `headless-collector.ts` real 기본 URL + 탭 쿼리 도메인 확장 + 로그인 안내 문구 반영
- [x] `setup-test-profile.ts` URL 하드코딩 제거 (`PO_URL` 환경변수 지원)
- [x] 타입체크 및 재실행 로그로 변경 반영 확인
- [x] 로그인된 절대경로 프로필 복제본으로 `collect:xvfb` 재검증 (트레이딩 패널 감지 + Miner started + 캔들 증가 확인)
- [x] 단일 파일 런북 문서 추가 (`docs/HEADLESS_COLLECTOR_RUNBOOK.md`)

## 2026-02-21 벌크 수집/백테스트 적합도 분석

- [x] 벌크 수집 경로 코드 추적 (`sendHistory` → `/api/candles/bulk` → SQLite)
- [x] 실DB/서버 상태 교차검증 (bulk 적재 여부, source 분포, 심볼별 커버리지)
- [x] 백테스트 입력 파이프라인 검증 (`candles_1m`/`ticks`/legacy 우선순위)
- [x] 백테스트 심볼 탐색 결함 수정 (cache 1개 존재 시 나머지 심볼 누락 버그)
- [x] 수집 서버 데이터 품질 보강 (심볼 정규화 + 진짜 1분 OHLC direct cache)
- [x] 수정 후 실행 검증 (`backtest-from-sqlite`, `/api/candles/bulk` 샘플, type-check)

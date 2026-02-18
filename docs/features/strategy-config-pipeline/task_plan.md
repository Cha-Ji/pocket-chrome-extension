# Strategy Config Pipeline - Task Plan

**Issue**: #73 (1단계: 전략 선택 자동화)
**브랜치**: `feat/73-strategy-config-pipeline`

## 1단계: 전략 선택 자동화 (이번 PR)

- [x] strategy-config 타입 정의 (`src/lib/signals/strategy-config.ts`)
- [x] leaderboard → strategy-config.json 추출 로직
- [x] CLI 빌드 스크립트 (`scripts/generate-strategy-config.ts`)
- [x] SignalGeneratorV2에 strategyConfig 로드 지원
- [x] 백테스트 전략 레지스트리 브릿지 (registerBacktestStrategy)
- [x] config 우선 → fallback 기본 로직 동작
- [x] 테스트 fixture (`tests/fixtures/leaderboard-sample.json`)
- [x] strategy-config 추출 테스트 (14개)
- [x] SignalGeneratorV2 config 통합 테스트 (8개)
- [x] TypeScript 컴파일 에러 0건
- [x] 기존 테스트 전체 통과 (938개)

## 2단계: Forward Test 파이프라인 (후속 이슈)

- [ ] strategy-config.json 기반 Forward Test 실행
- [ ] 실시간 성과 추적 및 기록

## 3단계: 주간 자동 재최적화 (후속 이슈)

- [ ] cron 기반 leaderboard 재실행
- [ ] 자동 config 갱신

## 4단계: LLM 리포트 (후속 이슈)

- [ ] 전략 성과 분석 리포트 자동 생성

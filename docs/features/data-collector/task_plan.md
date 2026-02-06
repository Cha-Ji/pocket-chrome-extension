# Task Plan - Data Collector (데이터 수집기)

## 🎯 목표
Pocket Option의 실제 시장 데이터를 수집하여 고품질 백테스트 데이터셋 구축

## 📋 작업 목록

### Phase 1: 로컬 수집 서버 구축
- [ ] `scripts/data-collector-server.ts` 생성 (Express + SQLite)
- [ ] API 엔드포인트 구현 (`POST /api/candle`)
- [ ] 데이터베이스 스키마 설계 (Candle, Tick)

### Phase 2: 익스텐션 연동
- [ ] `src/background/data-sender.ts` 구현
- [ ] 실시간 캔들 완성 시 서버로 전송 로직 추가
- [ ] 연결 상태 모니터링 (서버 켜져 있을 때만 전송)

### Phase 3: 과거 데이터 수집 (History Scraper)
- [ ] Pocket Option 차트 로딩 시 과거 데이터 캡처 분석
- [ ] 스크롤/줌 조작으로 과거 데이터 로딩 트리거 연구
- [ ] `Load More` 자동화 로직 구현

### Phase 4: 백테스트 연동
- [ ] 백테스터가 SQLite 데이터를 읽도록 어댑터 구현

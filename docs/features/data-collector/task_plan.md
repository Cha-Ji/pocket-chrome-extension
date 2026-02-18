# Task Plan - Data Collector (데이터 수집기)

## 🎯 목표
Pocket Option의 실제 시장 데이터를 수집하여 고품질 백테스트 데이터셋 구축

## 📋 작업 목록

### Phase 1: 로컬 수집 서버 구축
- [x] `scripts/data-collector-server.ts` 생성 (Express + SQLite)
- [x] API 엔드포인트 구현 (`POST /api/candle`)
- [x] 데이터베이스 스키마 설계 (Candle, Tick)

### Phase 2: 익스텐션 연동
- [x] `src/lib/data-sender.ts` 구현
- [x] 실시간 캔들 완성 시 서버로 전송 로직 추가
- [x] 연결 상태 모니터링 (서버 켜져 있을 때만 전송)

### Phase 3: 과거 데이터 수집 (History Scraper)
- [ ] Pocket Option 차트 로딩 시 과거 데이터 캡처 분석
- [ ] 스크롤/줌 조작으로 과거 데이터 로딩 트리거 연구
- [ ] `Load More` 자동화 로직 구현

### Phase 4: 백테스트 연동
- [ ] 백테스터가 SQLite 데이터를 읽도록 어댑터 구현

### Phase 5: Docker 분리 (운영 환경)
- [x] `apps/collector/` 독립 패키지 생성 (package.json, tsconfig.json)
- [x] 서버 코드 포팅 (`apps/collector/src/index.ts`) — extension 코드 의존 제거
- [x] `toEpochMs` 유틸리티 인라인 (`apps/collector/src/utils/time.ts`)
- [x] Dockerfile 작성 (multi-stage, Node 20, better-sqlite3 네이티브 빌드, non-root)
- [x] `docker-compose.yml` 작성 (포트/볼륨/헬스체크/restart)
- [x] 루트 `package.json`에 Docker 편의 스크립트 추가
- [x] `docs/SETUP_GUIDE.md` Docker 섹션 추가
- [x] `findings.md` / `progress.md` 업데이트
- [ ] Docker 빌드 검증 (`docker compose build && docker compose up -d`)
- [ ] 로컬 테스트 (`curl /health`, 샘플 POST)

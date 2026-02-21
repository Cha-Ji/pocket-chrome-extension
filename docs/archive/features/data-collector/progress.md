# Progress - Data Collector

## 2026-02-17
- **Docker 분리 완료**: `apps/collector/` 독립 패키지 생성
  - `package.json`, `tsconfig.json`, `src/index.ts`, `src/utils/time.ts`
  - `Dockerfile` (multi-stage, Node 20, non-root)
  - `docker-compose.yml` (서비스, 볼륨, 헬스체크)
  - 루트 `package.json`에 `collector:docker:up/down/logs` 스크립트 추가
- 문서 업데이트: `docs/SETUP_GUIDE.md`에 Docker 실행법 추가, `findings.md`에 분리 결정 기록
- 다음 행동: Docker 빌드 검증 (`docker compose build`), 로컬 테스트 (`curl /health`)

## 2026-02-02
- 작업 시작: 데이터 수집 서버 구축 및 과거 데이터 수집 전략 수립
- 3-file pattern 문서 생성 (`docs/features/data-collector/`)

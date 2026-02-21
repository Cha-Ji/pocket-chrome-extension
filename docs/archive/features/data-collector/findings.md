# Findings - Data Collector

## 📅 2026-02-02

### 과거 데이터 수집 가능성 분석 (Pocket Option)

1.  **웹소켓(WebSocket) 방식**
    - Pocket Option은 웹소켓(`wss://...`)을 통해 차트 데이터를 받습니다.
    - 초기 로딩 시 `loadHistory` 또는 유사한 메시지를 서버로 보냅니다.
    - **전략**: 이 웹소켓 메시지를 인터셉트하거나, 동일한 포맷으로 요청을 보내 과거 데이터를 받아낼 수 있습니다.

2.  **API/XHR 방식**
    - 일부 플랫폼은 REST API로 히스토리를 제공하지만, PO는 주로 WS를 사용합니다.
    - 개발자 도구 네트워크 탭 분석이 필요합니다.

3.  **UI 스크롤 방식 (Fallback)**
    - 차트를 마우스 휠로 드래그하면 추가 데이터가 로딩됩니다.
    - Playwright 등으로 이를 자동화하여 DOM에서 긁어올 수 있지만 느리고 불안정합니다.

### 데이터베이스 선택: SQLite
- 파일 기반이라 관리가 쉽습니다.
- Node.js (`better-sqlite3`)와 호환성이 좋습니다.
- 수백만 행의 캔들 데이터도 거뜬히 처리합니다.

### 아키텍처 결정
- **Server**: Node.js (Express) + SQLite
- **Client**: Chrome Extension (Background Script)
- **Protocol**: HTTP POST (단순하고 견고함)

## 📅 2026-02-17

### Docker 분리 결정

**결정**: Data Collector Server를 `apps/collector/`로 완전 분리, Docker로 운영 가능하게 변경.

**이유**:
1. **환경 재현성**: better-sqlite3 네이티브 모듈은 OS/Node 버전에 따라 빌드가 실패할 수 있음. Docker로 환경 고정.
2. **배포 독립성**: 익스텐션 빌드(Vite + React)와 서버 런타임(Express + SQLite)은 의존성/라이프사이클이 전혀 다름. 단일 package.json에 혼재하면 devDependencies 오염 및 빌드 복잡도 증가.
3. **데이터 영속성**: Docker named volume으로 SQLite DB를 마운트하면 컨테이너 재시작/재빌드에도 데이터 유지.
4. **운영 편의**: `docker compose up -d`로 원커맨드 실행, healthcheck 자동 감시, `restart: unless-stopped`로 크래시 복구.

**구조**:
```
apps/collector/
├── package.json      # 독립 의존성 (express, better-sqlite3, cors, body-parser)
├── tsconfig.json     # NodeNext 모듈, dist/ 출력
├── Dockerfile        # multi-stage (builder → runtime), non-root
├── .dockerignore
└── src/
    ├── index.ts      # 서버 메인 (scripts/data-collector-server.ts에서 포팅)
    └── utils/
        └── time.ts   # toEpochMs 인라인 (extension 코드 의존 제거)
```

**기존 코드와의 관계**:
- `scripts/data-collector-server.ts`는 그대로 유지 (로컬 개발용 `npm run collector`)
- `apps/collector/src/index.ts`는 동일 엔드포인트/스키마/로직이지만 extension import 경로에 의존하지 않음
- `toEpochMs`를 `apps/collector/src/utils/time.ts`에 인라인 복사

**Plan B (최소 변경 도커)**:
루트에서 `npx tsx scripts/data-collector-server.ts`를 실행하는 Dockerfile도 가능하나, extension devDependencies 전체 설치 필요 + tsx 런타임 오버헤드 + 이미지 크기 비대화로 운영 부적합.

## 관련 참조
- History Mining 이슈: [PO-16](../../issues/PO-16-history-mining-fix/)
- DataSender 최적화: [PO-19](../../issues/PO-19/)
- WS 후킹: [tampermonkey-integration](../../research/tampermonkey-integration/)
- 서버 소스 (레거시): `scripts/data-collector-server.ts`
- 서버 소스 (Docker): `apps/collector/src/index.ts`
- Docker 설정: `docker-compose.yml`, `apps/collector/Dockerfile`

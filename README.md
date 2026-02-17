# Pocket Option Auto Trading Chrome Extension

Pocket Option 바이너리 옵션 플랫폼에서 자동 매매를 수행하는 Chrome Extension입니다.

## 주요 기능

- **실시간 가격 데이터 수집**: WebSocket 인터셉트 및 DOM 파싱
- **기술적 지표 계산**: RSI, SMA, EMA, MACD, Stochastic, Bollinger Bands, ATR, CCI, Williams %R 등
- **자동 매매 실행**: CALL/PUT 신호 기반 자동 거래 (데모 모드 전용)
- **전략 백테스팅**: 44개 전략 성과 분석 및 리더보드
- **거래 로그 및 통계**: IndexedDB 기반 거래 내역 저장 및 분석

## 기술 스택

- Chrome Extension (Manifest V3)
- React + Tailwind CSS (Side Panel UI)
- TypeScript (strict mode)
- Dexie.js (IndexedDB)
- Vitest (테스트)

## 설치 및 실행

### 사전 요구사항

- Node.js v20+
- npm v10+
- Chrome 브라우저

### 개발 환경 설정

```bash
# 의존성 설치
npm ci

# 개발 빌드 (localhost 권한 포함)
npm run dev

# 또는 개발용 빌드
npm run build:dev
```

### Chrome에 로드

1. `chrome://extensions` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `dist/` 폴더 선택

### Tampermonkey 설정 (WebSocket 데이터 수신)

Chrome Extension의 Content Script는 Isolated World에서 실행되어 WebSocket에 직접 접근할 수 없습니다.
Tampermonkey를 통해 Main World에서 WebSocket을 후킹합니다.

1. [Tampermonkey](https://www.tampermonkey.net/) 설치
2. Tampermonkey 대시보드에서 새 스크립트 생성
3. `scripts/tampermonkey/inject-websocket.user.js` 내용 붙여넣기 및 저장

대안으로 `scripts/manual-injection/hook.js`를 브라우저 콘솔에 직접 붙여넣을 수 있습니다.

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│  Side Panel (React UI)                          │
│      ↕ chrome.runtime.sendMessage               │
│  Background (Service Worker)                    │
│      ↕ chrome.tabs.sendMessage                  │
│  Content Script                                 │
│      ↕ window.postMessage (pq-bridge)           │
│  Tampermonkey (Main World, WS Hook)             │
└─────────────────────────────────────────────────┘
```

| 모듈 | 역할 |
|------|------|
| `src/background/` | 중앙 상태 관리, 메시지 라우팅, DB 저장 |
| `src/content-script/` | DOM 가격 추출, WebSocket 인터셉트, 거래 실행 |
| `src/side-panel/` | 사용자 인터페이스 (상태, 제어, 로그) |
| `src/lib/` | 공유 라이브러리 (DB, 지표, 백테스트, 신호) |

## 개발 명령어

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run build:dev    # 개발용 빌드 (localhost 권한)
npm test             # 테스트 실행
npm run test:ci      # CI 테스트 (백테스트 제외)
npm run test:coverage # 커버리지 리포트
npm run lint         # ESLint 체크
```

## 안전 규칙

> **데모 모드 3중 체크**: 실제 돈 거래를 방지하기 위해 모든 거래 실행 전 3가지 조건을 확인합니다.
> 1. URL에 'demo' 파라미터 포함
> 2. Chart 요소에 'demo' 클래스 존재
> 3. 잔액 라벨에 'Demo' 텍스트 포함

## 프로젝트 문서

- `CLAUDE.md` — LLM 에이전트용 개발 가이드라인
- `docs/SETUP_GUIDE.md` — 상세 설치 및 운영 가이드
- `docs/DOCUMENTATION_RULES.md` — 문서화 규칙

## 라이선스

Private repository — 무단 복제 및 배포를 금지합니다.

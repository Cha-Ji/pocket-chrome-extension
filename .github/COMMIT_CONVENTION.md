# 커밋 메시지 컨벤션

## 기본 원칙

**이 레포지토리는 여러 LLM 에이전트와 사람이 협업하는 프로젝트입니다.**
- 제목: 한국어로 작성 (차지님이 빠르게 스캔 가능)
- 본문: 영어로 작성 (LLM이 나중에 컨텍스트 이해 가능)
- 이슈 티켓: 웬만하면 항상 생성 후 커밋 (`[-]`는 예외적 상황만)

---

## 커밋 메시지 작성 체크리스트

### 1단계: 이슈 티켓 확인
- [ ] 현재 작업에 대한 Jira/GitHub 이슈가 있는가?
  - 있음 → `[PO-17]` 형식으로 사용
  - 없음 → **이슈를 먼저 생성하세요** (CLAUDE.md 참고)
  - 긴급 핫픽스/의존성 업데이트만 `[-]` 허용

### 2단계: 변경 타입 선택
- `fix`: 버그 수정
- `feat`: 신규 기능 추가
- `refactor`: 코드 개선 (기능 변경 없음)
- `docs`: 문서 수정
- `test`: 테스트 코드 추가/수정
- `chore`: 빌드, 패키지, 설정 변경

### 3단계: 타입별 템플릿 적용

---

## 타입별 템플릿

### Type 1: fix (버그 수정)

**필수 항목**: 원인, 해결, 영향범위, LLM Context
```
[PO-17][dom-utils] WebSocket 파서 null 체크 누락 수정

* 원인: 중첩 객체 접근 시 방어 로직 없음
* 해결: Optional chaining 적용
* 영향범위: backtest 모듈만 (API 변경 없음)
* LLM Context: Enhanced WebSocket parser with defensive null checks using optional chaining (?.) operator to prevent runtime errors when accessing nested properties in message.data.candles[0].timestamp scenarios.
```

**작성 가이드**:
- 원인: 기술적 근본 원인 (로그 에러, 재현 조건 포함)
- 해결: 구체적 수정 방법 (코드 레벨)
- 영향범위: 영향받는 모듈, API 변경 여부, 호환성
- LLM Context: 다른 LLM이 이해할 수 있도록 영어로 상세 작성

---

### Type 2: feat (신규 기능)

**필수 항목**: 구현 내용, 영향범위, LLM Context
```
[PO-19][backtest] 전략 성과 리더보드 추가

* 구현 내용: 승률/MDD/샤프지수 기준 전략 랭킹 UI
* 영향범위: UI 신규 페이지 추가, API 엔드포인트 2개 생성
* LLM Context: Implemented strategy leaderboard with sortable columns (win rate, max drawdown, Sharpe ratio). Uses react-table v8 with persistent sort state in localStorage. API endpoints: GET /api/strategies/ranking, POST /api/strategies/compare.
```

**작성 가이드**:
- 구현 내용: 사용자 관점에서 무엇이 추가되었는가
- 영향범위: 새로운 파일, API, 의존성 추가 여부
- LLM Context: 기술 스택, 주요 함수/컴포넌트, 데이터 흐름

---

### Type 3: refactor (리팩토링)

**필수 항목**: 변경 이유, 주요 변경, 영향범위, LLM Context
```
[PO-20][logger] 로거 시스템 중앙화

* 변경 이유: 15개 모듈에 중복된 console.log 제거
* 주요 변경: winston 기반 중앙 로거, 모듈별 네임스페이스 분리
* 영향범위: 전체 모듈 (로그 포맷 통일, 기존 기능 변경 없음)
* LLM Context: Centralized logging using winston with module-specific namespaces. Replaced scattered console.log calls across 15 modules. Log levels: error/warn/info/debug. Output targets: file rotation + console transport.
```

**작성 가이드**:
- 변경 이유: 왜 리팩토링이 필요했는가 (기술 부채, 성능, 유지보수성)
- 주요 변경: Before/After 구조, 패턴 변경
- 영향범위: 외부 API 변경 없음을 명시, 내부 구조 변경 범위
- LLM Context: 리팩토링 패턴, 사용된 디자인 원칙

---

### Type 4: docs/test/chore (간소화)

**필수 항목**: LLM Context만
```
[PO-21][README] 설치 가이드 업데이트

* LLM Context: Updated installation guide with Node.js v20 requirement and troubleshooting section for M1 Mac users.
```
```
[-][deps] package.json 의존성 보안 패치

* LLM Context: Updated dependencies to patch security vulnerabilities (CVE-2024-xxxx). No breaking changes. Tested locally.
```

**작성 가이드**:
- 간단한 변경은 원인/해결 생략
- LLM Context에 핵심 변경사항만 영어로 1-2줄
- 이슈 티켓 없는 경우 `[-]` 사용 가능 (긴급 핫픽스, 의존성 업데이트만)

---

## 금지 사항

**제목만 쓰고 본문 생략 금지**
```
[PO-17][dom-utils] WebSocket 파서 수정
# 본문 없음 → LLM이 나중에 컨텍스트 모름
```

**한글/영어 혼용 금지**
```
[PO-17][dom-utils] Fix WebSocket parser null check
* 원인: Nested object access without null checks  # 제목은 한글, 본문은 영어로 통일
```

**이슈 없이 큰 변경 커밋 금지**
```
[-][전체] 아키텍처 전면 리팩토링  # 이슈를 반드시 만들어야 함
```

---

## LLM 에이전트 작성 시 주의사항

1. **이슈 티켓 생성 우선**: 커밋 전에 항상 이슈가 있는지 확인. 없으면 CLAUDE.md의 이슈 생성 가이드 참고하여 생성
2. **타입 판단 기준**:
   - 버그로 인한 장애/에러 → `fix`
   - 새로운 기능/UI 추가 → `feat`
   - 동작은 같지만 코드 개선 → `refactor`
3. **LLM Context 작성 팁**:
   - 파일명, 함수명, 라이브러리 버전 명시
   - 다른 LLM이 3개월 후 읽어도 이해할 수 있도록
   - 기술적 결정 이유 포함 (왜 이 방법을 선택했는가)

# 발견사항

## 결정 사항

- (2026-02-02) 3-file pattern 적용을 위해 `task_plan.md`, `findings.md`, `progress.md`를 생성.
- (2026-02-02) 에러 처리 모듈을 `src/lib/errors/index.ts`에 추가하고 `AppError`, `reportError`, `toErrorMessage` 중심으로 표준화.
- (2026-02-21) Headless 수집 기본 타깃 URL을 real 경로(`https://pocketoption.com/en/cabinet/quick-high-low/`)로 전환.
- (2026-02-21) Extension 탭 탐색은 `pocketoption.com`만이 아니라 `po.trade`, `po2.trade`까지 포함하도록 확장.

## 제약/가정

- (2026-02-02) 작업 범위와 위치는 `/mnt/c/Users/chaji/Documents/pocket-chrome-extension` 기준.
- (2026-02-21) 미로그인 상태에서는 real/demo URL 모두 `https://pocketoption.com/en/login`으로 리다이렉트됨.
- (2026-02-21) `launchPersistentContext`는 동일 프로필 동시 실행 시 `ProcessSingleton` 충돌로 실패함.

## 핵심 정보

- (2026-02-02) 3-file pattern 스킬 템플릿은 `.agents/skills/3-file-pattern/references/file-templates.md`에 있음.
- (2026-02-02) 통합 지점: `src/background/index.ts`, `src/content-script/executor.ts`, `src/content-script/index.ts`, `src/side-panel/hooks/useTradingStatus.ts`.
- (2026-02-02) 테스트: `src/lib/errors/index.test.ts`에 기본 동작 검증 추가.
- (2026-02-21) `collect:xvfb` 실측 로그:
  - 프로필 충돌 시 `Failed to create a ProcessSingleton ... profile is already in use`
  - 신규 프로필에서는 로그인 미완료로 `트레이딩 패널 미감지` + `현재 URL: .../en/login`
  - 문구가 real 계정 안내(`PO 리얼 계정 로그인`)로 반영됨
- (2026-02-21) 로그인된 절대경로 프로필(`/home/chaji/.pocket-quant/chrome-profile`) 복제본(`/tmp/pq-real-clone-profile-1771655137`)으로 재테스트 시:
  - `트레이딩 패널 감지 — 로그인 확인됨`
  - `Miner started`
  - 모니터링 중 `캔들: 1,463`으로 증가 확인
  - collector `/health` totalCandles: `198,468 -> 201,855` 증가 확인
- (2026-02-21) Headless 동작을 한 파일로 설명한 운영 문서 추가:
  - `docs/HEADLESS_COLLECTOR_RUNBOOK.md`
  - 실행 플로우, 메시지 경로, 환경변수, 장애 패턴, 운영 체크리스트 포함
- (2026-02-21) 벌크 수집/백테스트 분석 결과:
  - 벌크 수집 경로는 정상 동작: `DataSender.sendHistory()` → `/api/candles/bulk` → `candles` + `ticks`
  - 단, 운영 중 collector가 삭제된 DB inode를 잡고 쓰는 케이스를 실측함:
    - `/health` 카운트는 증가하지만 파일(`data/market-data.db`) 카운트는 불변
    - collector 재시작 후 `/health`와 파일 카운트가 다시 일치
  - `backtest-from-sqlite.ts` 결함:
    - `candles_1m`에 한 심볼이라도 있으면 나머지 `ticks` 심볼이 전부 제외됨
    - 패치로 심볼 탐색을 `cache + ticks + legacy` union으로 변경
  - 수집 품질 보강 패치:
    - `data-collector-server.ts` 저장 시 `normalizeSymbol()` 적용
    - bulk/단건 candle 입력이 "진짜 1분 OHLC"일 경우 `candles_1m`에 직접 반영 (OHLC 보존)

## 코드 스니펫

```text
// 필요한 경우 최소한의 예시만 기록
```

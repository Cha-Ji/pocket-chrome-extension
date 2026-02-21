# 진행 로그

## 2026-02-21

- (최신) real URL 마이그레이션 점검 수행:
  - `PO_URL=https://pocketoption.com/en/cabinet/quick-high-low/ npm run collect:xvfb` 실행으로 실패 재현
  - 프로필 lock 충돌 및 미로그인 리다이렉트(`.../en/login`) 확인
  - `scripts/headless-collector.ts` real 기본 URL, 탭 도메인 매칭 확장, 로그인 안내 문구 수정
  - `scripts/setup-test-profile.ts` URL 하드코딩 제거 및 `PO_URL` 적용
  - `npm run type-check` 통과
- (최신) 사용자 제보(리얼 로그인 완료) 반영 재검증:
  - 절대경로 프로필(`/home/chaji/.pocket-quant/chrome-profile`)은 기존 collector 프로세스가 lock 점유 중임 확인
  - lock 충돌 회피를 위해 프로필 복제본(`/tmp/pq-real-clone-profile-1771655137`)으로 `collect:xvfb` 실행
  - 결과: 트레이딩 패널 감지, Miner 시작 성공, 캔들 1,463건 증가 로그 확인
  - collector `/health` totalCandles 증가 확인 (`198,468 -> 201,855`)
- (최신) LLM 단일 참조용 문서 작성:
  - `docs/HEADLESS_COLLECTOR_RUNBOOK.md` 추가
  - headless 동작 원리, 실실행 순서, 실패 패턴, 수정 체크리스트를 단일 파일로 통합
- (최신) 벌크 수집/백테스트 적합도 분석 및 수정:
  - 실측: `/health` 카운트(20만+)와 파일 DB 카운트(6만대)가 불일치 → collector가 `(deleted)` DB handle에 쓰는 상태 확인
  - collector 재시작 후 `/health`와 파일 DB 카운트 일치 복구
  - `scripts/backtest-from-sqlite.ts` 패치:
    - cache 존재 시 심볼 누락 버그 수정 (심볼 union 탐색)
    - source별 fallback 로딩 개선 (`history` → `realtime`)
  - `scripts/data-collector-server.ts` 패치:
    - 저장 시 심볼 정규화 적용
    - 진짜 1분 OHLC 히스토리(`OHLC != all equal`)를 `candles_1m`에 직접 반영
  - 검증:
    - `npm run type-check` 통과
    - `backtest-from-sqlite --source history` 실행 시 47개 자산 탐색(패치 전 1개)
    - `/api/candles/bulk` 샘플 전송으로 `candles/ticks/candles_1m` 동시 반영 확인
- 다음 행동: 필요 시 lock 점유 중인 원본 프로필 프로세스를 정리한 뒤, 원본 절대경로로 동일 검증 1회 추가 수행.

## 2026-02-02

- (최신) 에러 처리 모듈 추가 및 주요 엔트리 포인트 통합, 기본 테스트 작성.
- 다음 행동: 코드 변경 체크 업데이트, 필요 시 테스트 실행/보완.

# PO-136 Task Plan

## 목표

Binance 저장 데이터(JSON + SQLite) 기반 백테스트를 자동 실행하고, 결과를 Telegram으로 상세 전송한다.

## 체크리스트

- [x] GitHub Issue 생성 및 브랜치/worktree 분리
- [x] `scripts/backtest-from-sqlite.ts`에 JSON 리포트 출력 추가
- [x] 통합 실행 스크립트 `scripts/run-binance-backtests-and-notify.ts` 추가
- [x] `.env` 로딩 + Telegram 자격증명 검증 로직 추가
- [x] 부분 실패 허용(성공 결과 + 실패 상세 알림) 처리
- [x] 메시지 길이 제한(분할 전송) 처리
- [x] 테스트 코드 추가 (`scripts/run-binance-backtests-and-notify.test.ts`)
- [x] 테스트 실행 및 통과 확인
- [ ] 커밋 + 푸시 + PR 생성 (`Closes #136`)

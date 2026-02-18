# PO-136 Findings

## F1. 기존 SQLite 백테스트는 Markdown만 출력

- 기존 `scripts/backtest-from-sqlite.ts`는 `sqlite-backtest-report.md`만 저장하고 구조화 JSON 산출물이 없었다.
- Telegram 상세 알림 자동화를 위해 JSON 출력이 필요하다.

## F2. TelegramService는 Node CLI에서도 재사용 가능

- `TelegramService`는 `sendMessage()` 내부에서 fetch 기반 API 호출만 사용한다.
- `getTelegramService()`는 chrome storage에 의존하지만, CLI에서는 직접 `new TelegramService(config)`를 사용하면 된다.

## F3. run-backtest-report는 이미 JSON 산출물 제공

- `scripts/run-backtest-report.ts`는 `data/results/backtest-report-latest.json`를 생성한다.
- 오케스트레이터는 해당 JSON을 읽어 상위 전략을 요약하면 된다.

## F4. Telegram 메시지 길이 제한 대응 필요

- 상세 리포트는 단일 메시지 제한(약 4096자)에 걸릴 수 있으므로 분할 전송이 필수다.
- 줄 단위 분할 + 긴 단일 줄 강제 분할을 함께 적용한다.

## F5. 부분 실패 허용 정책 적용

- 사용자 선택: 두 파이프라인 중 하나가 실패해도 성공한 결과는 반드시 전송.
- 실패한 파이프라인은 stderr 요약을 별도 메시지로 전송한다.

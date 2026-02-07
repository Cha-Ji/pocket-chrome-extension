# Findings: Error Handling Module

## Key Decisions

- **Database Persistence**: 모든 에러 로그는 IndexedDB의 `logs` 테이블에 저장한다. 이는 Chrome Extension 환경에서 `console` 로그가 휘발되거나 확인하기 어려운 문제를 해결한다.
- **Log Retention**: 로그가 무한히 쌓이는 것을 방지하기 위해 추후 자동 삭제(Rotation) 정책이 필요할 수 있다. (일단은 구현 집중)
- **Severity Levels**: `info`, `warning`, `error`, `critical` 4단계를 사용한다. `error` 이상은 반드시 DB에 저장한다.

## Technical Constraints

- **Dexie Versioning**: DB 스키마 변경 시 버전 번호를 올려야 한다. (현재 v2 -> v3 예정)
- **Async Logging**: DB 저장은 비동기이므로, 에러 보고 과정(`reportError`)이 느려지지 않도록 주의해야 한다. (floating promise 허용 여부 고려)

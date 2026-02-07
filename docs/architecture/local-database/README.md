# Local Database 아키텍처

**역할**: IndexedDB(Dexie.js) 기반 로컬 데이터 저장

## DB 스키마

| 테이블 | 주요 필드 | 용도 |
|--------|----------|------|
| ticks | ticker, timestamp, price, serverTime | 실시간 가격 스냅샷 |
| strategies | name, config, description | 전략 설정 |
| sessions | type, startTime, endTime, initialBalance, finalBalance, winRate | 거래 세션 |
| trades | sessionId, ticker, direction, entry/exit time/price, result, profit | 개별 거래 기록 |

## 하위 모듈

| 모듈 | 설명 |
|------|------|
| schema | 테이블 구조, 인덱스, 마이그레이션 |
| export | CSV/JSON 내보내기 |
| retention | 오래된 데이터 자동 정리 정책 |

## 제약사항
- IndexedDB 용량 제한 (브라우저별 상이)
- Dexie.js 버전 관리 주의

## 관련 소스
- `src/lib/db/index.ts` (DB CRUD)

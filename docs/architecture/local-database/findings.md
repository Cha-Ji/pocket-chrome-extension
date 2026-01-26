# 발견사항

## 결정 사항

- (2026-01-26) 로컬 저장은 IndexedDB(Dexie.js) 기반으로 설계

## 제약/가정

- (2026-01-26) 틱 데이터는 대용량이므로 주기적 정리/압축 필요

## 핵심 정보

- (2026-01-26) ticks: ticker, timestamp, price, serverTime
- (2026-01-26) strategies: name, config, description
- (2026-01-26) sessions: type, startTime, endTime, initialBalance, finalBalance, winRate
- (2026-01-26) trades: sessionId, ticker, direction, entry/exit time/price, result, profit, snapshot

## 코드 스니펫

````text
// 필요한 경우 최소한의 예시만 기록
````

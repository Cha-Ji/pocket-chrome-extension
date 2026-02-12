---
type: feature
title: "candleDatasets 메타 테이블 추가 — 데이터셋 인벤토리 관리"
labels: ["enhancement", "feat"]
priority: p2
related_files:
  - src/lib/db/index.ts
created_by: cloud-llm
created_at: "2026-02-12"
---

## 목표

DB에 저장된 캔들 데이터의 메타정보를 관리하는 `candleDatasets` 테이블 추가.
UI에서 "백테스트 가능한 자산/기간" 조회 시 전체 캔들을 스캔하지 않고 메타 테이블만 조회.

## 요구사항

- `CandleDataset` 인터페이스 정의 (ticker, interval, startTime, endTime, candleCount, source, lastUpdated)
- Dexie 마이그레이션 (v4에 포함)
- `CandleDatasetRepository` CRUD 구현
- 캔들 추가/삭제 시 메타 자동 갱신 로직

## 완료 조건

- [x] `CandleDataset` 타입 정의
- [x] DB 스키마에 테이블 추가
- [x] `CandleDatasetRepository` 구현 (upsert, getAll, getByTicker, delete)
- [ ] 캔들 Repository와 연동 (bulkAdd 시 메타 갱신)

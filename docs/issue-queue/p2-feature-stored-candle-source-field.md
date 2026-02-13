---
type: feature
title: "StoredCandle에 source 필드 추가 — 데이터 출처 추적"
labels: ["enhancement", "feat"]
priority: p2
related_files:
  - src/lib/db/index.ts
created_by: cloud-llm
created_at: "2026-02-12"
---

## 목표

`StoredCandle` 인터페이스에 `source` 필드를 추가하여 캔들 데이터의 출처를 추적.
WebSocket 실시간 수집 vs 파일 import vs API 데이터를 구분하여 데이터 품질 관리.

## 요구사항

- `CandleSource` 타입 정의: `'websocket' | 'import' | 'api' | 'manual'`
- `StoredCandle.source` 필드 추가 (optional, 하위 호환)
- DB 마이그레이션 시 기존 데이터는 `source: undefined`로 유지 (Dexie 자동 처리)
- `CandleRepository.bulkAdd`에 source 파라미터 옵션 추가

## 완료 조건

- [x] `CandleSource` 타입 정의
- [x] `StoredCandle.source` 필드 추가
- [x] DB 인덱스에 `source` 추가 (v4)
- [x] `CandleRepository` 메서드에 source 반영

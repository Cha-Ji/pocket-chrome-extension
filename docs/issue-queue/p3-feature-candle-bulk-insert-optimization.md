---
type: feature
title: "Candle 데이터 벌크 인서트 성능 최적화"
labels: ["enhancement", "performance"]
priority: p3
related_files:
  - src/lib/db/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 목표

`CandleRepository.bulkAdd()`의 성능 개선.

## 요구사항

현재 각 캔들마다 개별 DB 쿼리 수행 → 대량 데이터 삽입 시 병목.

개선:
- Dexie.js의 `bulkPut()` 활용하여 배치 처리
- 중복 체크를 DB 레벨(unique index)로 위임

## 완료 조건

- [ ] `bulkPut()` 기반으로 리팩토링
- [ ] 벤치마크 비교 (before/after)
- [ ] 기존 테스트 통과 확인

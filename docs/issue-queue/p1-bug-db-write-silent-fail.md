---
type: bug
title: "DB Write 실패 시 Tick 데이터 무손실 유실"
labels: ["bug"]
priority: p1
related_files:
  - src/background/index.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

`handleTickData()`에서 DB 저장 실패 시 에러를 무시(`.catch(() => {})`)하여 가격 데이터가 영구 유실됨. 백테스트 및 분석에 사용할 데이터 무결성 손상.

## 원인 (파악된 경우)

- `src/background/index.ts` ~241-242행: `.catch(() => {})` 패턴으로 silent fail
- 에러 로깅도 없어 문제 발생 자체를 인지하기 어려움

## 해결 방안

- 저장 실패 시 메모리 버퍼에 보관 후 재시도
- 연속 실패 시 에러 알림 (Telegram 또는 UI)
- 최소한 `POError`로 에러 로깅

## 영향 범위

- `src/background/index.ts`

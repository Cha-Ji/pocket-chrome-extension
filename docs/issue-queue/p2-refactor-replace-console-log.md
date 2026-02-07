---
type: refactor
title: "console.log 490건 정리 - 구조화된 로깅 시스템 적용"
labels: ["refactor"]
priority: p2
related_files:
  - src/lib/logger/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

코드베이스에 `console.log/warn/error` 490건 산재. 개발용 로그가 프로덕션에 노출되며, 로그 레벨/필터링 불가. 예: `console.log('[PO] >>> SCRIPT LOADED <<<')`.

## 개선 목표

- `src/lib/logger/`의 기존 로거 모듈을 활용하여 전체 교체
- 로그 레벨 (DEBUG, INFO, WARN, ERROR) 적용
- 프로덕션 빌드에서 DEBUG 로그 자동 제거

## 영향 범위

- 전체 `src/` 디렉토리

## 롤백 계획

- 모듈별 점진적 교체

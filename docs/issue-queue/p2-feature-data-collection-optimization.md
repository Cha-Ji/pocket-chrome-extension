---
type: feature
title: "대규모 데이터 수집 최적화"
labels: ["enhancement"]
priority: p2
related_files: ["src/lib/data-sender.ts", "src/content-script/auto-miner.ts"]
created_by: cloud-llm
created_at: "2026-02-12"
jira_origin: PO-19
---

## 목표

1,500+ 캔들 대규모 히스토리 수집 시 발생하는 데이터 병목 해결

## 요구사항

- 대규모 payload 포맷 불일치 해결
- fetch 타임아웃 처리 개선
- DataSender 최적화 (Phase 2)

## 완료 조건

- [ ] 페이로드 포맷 정규화
- [ ] DataSender 청크 전송 지원
- [ ] 1,500+ 캔들 수집 검증

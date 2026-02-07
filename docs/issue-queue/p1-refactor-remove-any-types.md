---
type: refactor
title: "any 타입 193개 제거 - TypeScript 타입 안전성 강화"
labels: ["refactor"]
priority: p1
related_files:
  - src/lib/logger/
  - src/lib/signals/
  - src/content-script/websocket-parser.ts
  - src/background/index.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

코드베이스 전반에 `any` 타입이 193회 사용되어 TypeScript의 타입 안전성이 크게 저하됨. 런타임 타입 에러 디버깅이 어렵고, 리팩토링 시 컴파일러 지원을 받을 수 없음.

## 개선 목표

- 모든 `any`를 구체적 타입으로 교체
- `tsconfig.json`에서 `noImplicitAny: true` 활성화
- `noUnusedLocals: true`, `noUnusedParameters: true` 활성화

주요 대상:
| 파일 | `any` 사용 | 교체 대상 |
|------|-----------|----------|
| `lib/logger/` | `...args: any[]` | `unknown[]` |
| `lib/signals/` | `notifySignal(signal: any)` | Signal 인터페이스 |
| `websocket-parser.ts` | `detect: (data: any)` | `ParsedMessage` 타입 |
| `background/index.ts` | 메시지 핸들러 | `MessagePayload` union type |

## 영향 범위

- 전체 `src/` 디렉토리 (~30+ 파일)

## 롤백 계획

- 모듈별 점진적 교체, 각 모듈 테스트 통과 확인 후 머지

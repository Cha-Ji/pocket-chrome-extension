# Documentation Rules - 2단계 문서화 전략

**생성일:** 2026-01-30
**최종 수정:** 2026-02-07
**목적:** 컨텍스트 유지 및 프로젝트 추적 (실용성 중심)

---

## 2단계 문서화 전략

문서화 수준을 작업 상태에 따라 구분합니다.

### Tier 1: Full 3-File (활성 작업)

**적용 대상**: 현재 진행 중이거나 구현이 완료된 작업 (issues/, 활성 features/, strategies/)

| 파일 | 역할 | 최소 기준 |
|------|------|----------|
| `task_plan.md` | Phase별 체크리스트 | 20줄+, 구체적 항목 |
| `findings.md` | 결정/제약/기술정보 | 30줄+, 최소 1개 결정사항 |
| `progress.md` | 진행 로그 (역순) | 10줄+, 날짜 포함 |

### Tier 2: Single README (참조 문서)

**적용 대상**: 아키텍처 개요, 미착수 기능, 설계 단계 모듈

| 파일 | 역할 |
|------|------|
| `README.md` | 역할/구성/제약사항/소스 참조를 한 파일에 요약 |

**Tier 승격**: 작업이 시작되면 README.md를 유지하면서 3-file을 추가

---

## 필수 규칙

### findings.md 작성 원칙
- 결정사항에는 반드시 **날짜와 이유** 기록
- 코드 예시는 실제 동작하는 코드만 포함 (빈 placeholder 금지)
- 모든 findings.md 하단에 **관련 참조** 섹션 포함:
  ```markdown
  ## 관련 참조
  - 관련 이슈: [PO-XX](경로)
  - 소스 코드: `src/경로/파일.ts`
  - 아키텍처: [모듈명](경로)
  ```

### progress.md 작성 원칙
- 역순 시계열 (최신이 위)
- 각 항목에 날짜 포함
- 빈 파일 금지 (작업 미착수면 파일 자체를 생성하지 않음)

### task_plan.md 작성 원칙
- Phase 기반 구조 권장
- 체크박스로 진행 상태 추적
- 완료된 Phase는 체크 표시

---

## 폴더 구조

```
docs/
├── DOCUMENTATION_RULES.md     # 이 파일
├── head/                       # 프로젝트 전체 레벨 (Tier 1)
│   ├── task_plan.md
│   ├── findings.md
│   └── progress.md
├── architecture/               # 아키텍처 개요 (Tier 2)
│   ├── content-script/
│   │   ├── README.md           # 모듈 개요
│   │   └── dom-selectors/      # 활성 작업 (Tier 1)
│   │       ├── task_plan.md
│   │       ├── findings.md
│   │       └── progress.md
│   ├── side-panel-ui/README.md
│   ├── background-service-worker/README.md
│   └── local-database/README.md
├── features/
│   ├── error-handling/          # 완성 작업 (Tier 1)
│   │   ├── task_plan.md
│   │   ├── findings.md
│   │   └── progress.md
│   ├── data-collector/          # 활성 작업 (Tier 1)
│   │   ├── task_plan.md
│   │   ├── findings.md
│   │   └── progress.md
│   ├── navigator/README.md      # 미착수 (Tier 2)
│   ├── executor/README.md
│   ├── technical-analyst/README.md
│   └── backtester-logger/README.md
├── issues/                      # 이슈별 (Tier 1)
│   ├── PO-11/
│   ├── PO-13/
│   └── ...
├── research/                    # 리서치 (Tier 1 or 2)
└── strategies/                  # 전략 (Tier 1)
```

---

## 템플릿

### findings.md 템플릿
```markdown
# [작업명] - Findings

## 핵심 발견 사항
- ...

## 기술적 세부사항
- ...

## 결정 사항
| 날짜 | 결정 | 이유 |
|------|------|------|
| ... | ... | ... |

## 관련 참조
- 관련 이슈: [PO-XX](경로)
- 소스 코드: `src/경로`
```

### README.md 템플릿 (Tier 2)
```markdown
# [모듈명]

**역할**: 한 줄 설명

## 핵심 정보
- ...

## 제약사항
- ...

## 관련 소스
- `src/경로/파일.ts`
```

---

## 전략 평가 Score 기준표

전략 백테스트 결과를 0-100 종합 점수로 평가합니다. (`src/lib/backtest/scoring.ts`)

### 가중치 테이블

| 항목 | 가중치 | 설명 | 기준 |
|------|--------|------|------|
| 승률 (winRate) | 0.30 | 핵심 지표. 52.1% = 손익분기 (92% payout 기준) | 50%↓=0~20, 52.1%=50, 60%+=90 |
| 기대값 (EV) | 0.20 | p×b - q. 양수여야 수익 가능 | ≤0=0~20, 0.02=50, 0.10+=100 |
| 최대 드로다운 | 0.15 | 낮을수록 좋음 (역점수) | 0%=100, 30%+=0 |
| 최대 연속 손실 | 0.10 | 낮을수록 좋음 (역점수) | 0=100, 10+=0 |
| 이익 팩터 | 0.10 | 총이익/총손실 | <1.0=0~30, 1.5=60, 3.0+=100 |
| 거래 횟수 | 0.10 | 통계 유의성 | <30=부족, 200+=충분 |
| 안정성 | 0.05 | 주별 승률 표준편차 | 0=100, 15+=0 |

### 등급 기준

| 등급 | 점수 범위 | 의미 |
|------|-----------|------|
| A | 80-100 | 우수 — 실전 투입 가능 |
| B | 60-79 | 양호 — 조건부 사용 |
| C | 40-59 | 보통 — 개선 필요 |
| D | 20-39 | 불량 — 재설계 필요 |
| F | 0-19 | 부적합 — 사용 금지 |

### Scoring 프로필

| 프로필 | 용도 | 주요 차이 |
|--------|------|----------|
| `default` | 기본 평가 | 위 가중치 테이블 그대로 |
| `stability` | 소액/보수적 | MDD 0.25, 연속손실 0.15, 안정성 0.10 |
| `growth` | 대액/적극적 | EV 0.25, 이익팩터 0.15, 거래횟수 0.15 |

사용법: `calculateScore(input, getWeightsByProfile('stability'))`

### 전략 선택 절차

1. 백테스트 실행 → `calculateScore()` 호출 (프로필 선택 가능)
2. Score ≥ 60 (Grade B+)인 전략만 후보에 포함
3. 후보 중 `compositeScore` 상위 3개를 리더보드에 등록
4. 실전 적용 전 최소 200거래 이상의 표본에서 재검증

---

## 변경 시 동반 업데이트 규칙

| 변경 대상 | 필수 동반 업데이트 |
|-----------|-------------------|
| Score 가중치/임계값 | `scoring.test.ts` 스냅샷 테스트 갱신 |
| DB 스키마 | `docs/architecture/data-flows.md` 다이어그램 갱신 |
| 메시지 타입 추가 | `docs/architecture/data-flows.md` 다이어그램 갱신 |
| 데이터 흐름 변경 | mermaid 다이어그램 갱신 + 관련 테스트 확인 |
| 전략 추가/변경 | 백테스트 실행 후 Score 평가 기록 |

---

## 업데이트 주기

- **task_plan.md**: 새 작업 추가/완료 시
- **findings.md**: 새로운 발견/결정 시
- **progress.md**: 작업 시작/완료 시
- **README.md**: 모듈 구조 변경 시
- **data-flows.md**: 데이터 흐름/메시지 타입 변경 시

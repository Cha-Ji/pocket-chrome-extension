# 3-File Pattern 분석 리포트

> 분석일: 2026-02-07
> 범위: 레포 전체 (docs/, src/lib/errors/, root)

---

## 1. 현황 요약

| 항목 | 수치 |
|------|------|
| task_plan.md | 39개 |
| findings.md | 38개 |
| progress.md | 34개 |
| 3-file 완성 디렉토리 | ~35/40 (87.5%) |
| 내용 중위값 | ~25줄 (편차 극심) |

### 계층별 완성도

| 계층 | 디렉토리 수 | 완성율 | 내용 품질 |
|------|------------|--------|----------|
| docs/head/ | 1 | 100% | EXCELLENT |
| docs/issues/ | 11 | 91% | GOOD~EXCELLENT |
| docs/architecture/ | 19 | 100% | MINIMAL (대부분 템플릿) |
| docs/features/ | 6 | 100% | 1개 우수, 나머지 템플릿 |
| docs/research/ | 3 | 33% | INCOMPLETE |
| docs/strategies/ | 1 | 100% | EXCELLENT |

---

## 2. 장점

### 높은 채택율
거의 모든 작업 디렉토리에 일관된 3-file 구조 적용.

### Head 레벨 골드 스탠다드
`docs/head/`의 파일들이 모범 사례:
- task_plan.md: 6단계 Phase 기반, 체크박스 활용
- findings.md: 의사결정/제약사항 구조화
- progress.md: 역순 시계열, 메트릭 포함

### 이슈 추적에 효과적
`docs/issues/PO-13` (155줄 findings), `PO-11` (79줄) 등
실제 작업의 의사결정 근거와 진행 로그가 잘 기록됨.

### 일부 뛰어난 사례
- `docs/features/error-handling/findings.md` (373줄)
- `docs/architecture/content-script/dom-selectors/findings.md` (165줄, 코드 포함)
- `docs/strategies/bitshin-option/` (전략 분석 상세)

---

## 3. 단점

### 3.1 템플릿 복붙 (가장 심각)
features/의 navigator, executor, technical-analyst, backtester-logger는
거의 동일한 10~20줄짜리 템플릿. 실질적 내용 없음.

### 3.2 깨진 파일
- `docs/issues/PO-19/findings.md` → 0 bytes
- `docs/issues/PO-19/progress.md` → 0 bytes
- `docs/issues/PO-16/progress.md` → 비어있음
- `docs/research/` → progress.md 2개 누락, task_plan.md 1개 누락

### 3.3 내용 깊이 편차
- 최고: 373줄 (error-handling/findings.md)
- 최저: 6줄 (다수 progress.md)
- 대부분 최소한 수준

### 3.4 교차 참조 부재
Head → Issue → Architecture → Feature 간 링크 거의 없음.
이슈-아키텍처-기능 간 매핑 파악 불가.

### 3.5 "코드 스니펫" 섹션 미사용
findings.md 템플릿의 "코드 스니펫" 섹션이 거의 항상 비어있음.

---

## 4. 효과성 평가

| 측면 | 점수 | 비고 |
|------|------|------|
| 채택율 | 9/10 | 광범위 적용 |
| 완전성 | 6/10 | 87% 완성, 나머지 깨짐 |
| 내용 일관성 | 5/10 | 편차 극심 |
| 교차 참조 | 3/10 | 계층 간 연결 없음 |
| 실용성 | 6/10 | Head/Issues 유용, 나머지 형식적 |

---

## 5. 개선 제안

### P1: 깨진 파일 정리
PO-19, PO-16, research/ 빈 파일 → 내용 채우거나 삭제.

### P2: 템플릿 복붙 제거
- **옵션 A**: 실제 작업 디렉토리만 3-file 유지, 나머지 단일 README 축소
- **옵션 B**: 최소 내용 기준 설정 (task_plan 20줄+, findings 30줄+)

### P3: 교차 참조 체계
findings.md에 "관련 참조" 섹션:
```markdown
## 관련 참조
- 이슈: docs/issues/PO-11/
- 소스: src/content-script/websocket-interceptor.ts
- 아키텍처: docs/architecture/content-script/
```

### P4: "코드 스니펫" 섹션 정책
미사용 섹션은 템플릿에서 제거하거나 필수화.

### P5: 2단계 문서화 전략
- **활성 작업** (issues/, 진행중 features/): 3-file 풀 적용
- **참조 문서** (architecture/, 완료된 features/): findings.md 단일 파일로 충분

---

## 6. 안티패턴 정리

| 안티패턴 | 설명 | 발생 위치 |
|----------|------|----------|
| Template Clone | 내용 없는 템플릿 복붙 | features/navigator, executor 등 |
| Empty Section | "코드 스니펫" 등 빈 섹션 반복 | 대부분 findings.md |
| Orphan File | 3-file 중 일부만 존재 | research/ 하위 |
| Silent Abandonment | 작업 중단 후 빈 파일 방치 | PO-19 |
| Head-Heavy | Head만 상세, 하위는 스텁 | architecture/, features/ |

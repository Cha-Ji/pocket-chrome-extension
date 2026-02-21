# Executor 기능

**역할**: 진입 조건 충족 시 CALL/PUT 주문 실행

## 핵심 설계
- 마틴게일/고정진입 설정 옵션
- 슬리피지 방지 및 일일 손실 한도 적용
- 신호-현재가 차이 클 경우 주문 취소

## 상태
- 기본 구현 완료 (CALL/PUT 클릭 실행)
- 리스크 관리 로직 추가 필요

## 관련 소스
- `src/content-script/executor.ts` (구현체)
- `src/lib/types/index.ts` (isDemoMode 안전 체크)

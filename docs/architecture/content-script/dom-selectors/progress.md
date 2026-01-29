# DOM Selectors - Progress

## 2026-01-29

### 완료
- 플레이스홀더 셀렉터 정의
- 셀렉터 저장 구조 설계 (chrome.storage.local)
- Content Script에 셀렉터 로딩 로직 구현

### 대기 중
- 실제 셀렉터 발견 (로그인 필요)

### 메모
- 셀렉터 발견 후 `src/lib/types/index.ts`의 `DEFAULT_SELECTORS` 업데이트 필요
- 셀렉터 변경 시 Content Script 재로드 필요

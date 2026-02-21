# Findings - Data Collection Optimization (PO-19)

## 핵심 문제

WebSocket 파서가 1,500개 이상의 캔들을 정상 파싱하지만, 서버 DB에는 저장되지 않음 (`Bulk saved` 로그 부재).

## 원인 분석

### 1. 페이로드 불일치
- `DataSender`가 보내는 JSON 형식과 서버의 `/api/candles/bulk` 유효성 검사 간 미세한 불일치 추정
- 서버가 silent fail (에러 응답 없이 무시)하고 있을 가능성

### 2. 네트워크 타임아웃
- 1,500개 이상의 대량 캔들을 한 번에 전송 시 `fetch` 요청 타임아웃 발생 가능
- 서버 측 `body-parser` 용량 제한 초과 가능성

## 결정 사항

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-02-06 | DataSender 필터링/검증 로직 강화 | 서버 도달 전 데이터 정합성 보장 |
| 2026-02-06 | 서버 에러 핸들링 개선 | silent fail 방지, 실패 원인 추적 |
| 2026-02-06 | 배치 분할 전송 검토 | 대량 데이터 타임아웃 방지 |

## 관련 참조
- 소스: `src/content-script/websocket-interceptor.ts`, `src/background/data-sender.ts`
- 서버: `scripts/data-collector-server.ts` (`/api/candles/bulk`)
- 관련 이슈: [PO-16](../PO-16-history-mining-fix/) (History Mining 근본 원인)

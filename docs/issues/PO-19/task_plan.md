# Task Plan: Data Collection Optimization (PO-19)

## 목표
- 대량의 과거 데이터(History) 수집 시 서버 저장 병목 현상 해결.
- `DataSender`와 `Collector Server` 간의 데이터 정합성 보장.
- 10GB급 대용량 데이터 구축을 위한 안정성 확보.

## 작업 단계

### 1단계: 원인 분석 (완료)
- **현상**: 웹소켓 파서는 1,500개 이상의 캔들을 파싱하지만, 서버 DB에는 저장되지 않음 (`Bulk saved` 로그 부재).
- **원인**: `DataSender`에서 보내는 페이로드 형식과 서버의 유효성 검사 로직 간의 미세한 불일치 추정. 또는 `fetch` 요청의 타임아웃 가능성.

### 2단계: DataSender 최적화
- `sendHistory` 메서드에서 데이터 필터링 로직 강화.
- 전송 전 데이터 유효성 검증 단계 추가.
- 에러 로깅 상세화 (실패한 캔들 샘플 출력).

### 3단계: 서버 수신 로직 보강
- `data-collector-server.ts`의 `/api/candles/bulk` 엔드포인트에서 에러 처리 강화.
- `JSON.parse` 에러 방지 및 용량 제한 재확인.

### 4단계: 검증
- 수동 스크롤 시 `[DataSender] ✅ Saved ... history candles` 로그 확인.
- `curl /health` 명령어로 `totalCandles` 급증 확인.

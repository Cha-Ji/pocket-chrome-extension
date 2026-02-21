# 백테스트 충분성 개선용 프롬프트

아래 프롬프트를 그대로 복사해서 에이전트에게 전달하면,  
현재 프로젝트의 "백테스트 데이터는 많이 쌓이는데 실제 백테스트는 0건으로 끝나는" 문제를 해결하도록 작업을 지시할 수 있다.

## 복붙용 프롬프트

```text
프로젝트 경로: /Users/kong-bee/Documents/pocket-chrome-extension

목표:
백테스트 시 payout 필터 때문에 history 데이터가 전부 제외되는 문제를 해결하고,
백테스트 데이터 충분성 판단이 실제 수집량과 일치하도록 파이프라인을 수정해줘.

핵심 요구사항:
1) backtest 스크립트에서 payout 필터를 옵션으로 끌 수 있게 해줘.
   - 파일: scripts/backtest-from-sqlite.ts
   - 요구: --allow-payout true/false CLI 옵션 추가
   - 동작: allow-payout=true면 legacy 경로의 resampleTicks에서 filterPayout=false로 실행

2) 백테스트 데이터 소스 우선순위를 강제할 수 있게 해줘.
   - 파일: scripts/backtest-from-sqlite.ts
   - 요구: --source-mode auto|legacy|ticks|cache 옵션 추가
   - 동작:
     - auto: 기존 동작 유지
     - legacy: candles_1m/ticks를 무시하고 candles legacy(source=history) 우선 사용
     - ticks/cache도 명시적으로 강제 가능하게

3) 너무 작은 소스(예: ticks 1건, candles_1m 1건)가 전체 백테스트를 가로채지 않게 해줘.
   - 파일: scripts/backtest-from-sqlite.ts
   - 요구: 최소 캔들 수(기본 52, 옵션화 가능) 미만인 소스는 후보에서 제외
   - 예: --min-candles 52

4) history 수집 데이터가 ticks로도 남도록 collector 저장 정책을 조정해줘.
   - 파일: scripts/data-collector-server.ts
   - 요구:
     - /api/candles/bulk, /api/candle에서 source='history'일 때는 payout-like 값이어도 ticks 저장 허용
     - 기존 realtime payout 필터는 유지해도 됨

5) 검증
   - 실행 전/후 DB 통계 비교 쿼리 제시:
     - source별 candles count
     - ticks count
     - symbol별 history coverage
   - 아래 명령이 최소 1개 이상 자산에서 백테스트 가능 상태가 되도록 확인:
     - npx tsx scripts/backtest-from-sqlite.ts --source history --source-mode legacy --allow-payout true

출력 형식:
- 먼저 수정 요약
- 파일별 변경 이유
- 실행한 검증 명령과 핵심 결과
- 남은 리스크/다음 단계

주의:
- 기존 사용자 변경사항은 절대 되돌리지 말고, 필요한 부분만 최소 수정해줘.
```

## 권장 사용 시점

- 벌크 history는 많이 쌓이는데 backtest 결과가 "testable asset 0"일 때
- `ticks` 또는 `candles_1m`에 소량 데이터가 있어 source 우선순위가 꼬일 때
- payout-like 데이터(OHLC 동일, 0~100)가 history에 섞여 필터링되는 환경일 때

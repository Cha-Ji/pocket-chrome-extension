# 발견사항

## 결정 사항

- (2026-01-26) Chrome Extension Manifest V3 + TypeScript 기반으로 구현
- (2026-01-26) UI는 React + Tailwind CSS, Side Panel 중심으로 구성
- (2026-01-26) 데이터 저장은 IndexedDB(Dexie.js)로 설계

## 제약/가정

- (2026-01-26) 브라우저 자동화 감지로 계정 제재 위험이 존재
- (2026-01-26) DOM 구조 변경에 따라 셀렉터 유지보수 필요
- (2026-01-26) 틱 데이터는 대용량이므로 주기적 정리/압축 필요

## 핵심 정보

- (2026-01-26) 목표: 데이터 수집, 분석, 백테스트, 자동 매매를 수행하는 크롬 익스텐션
- (2026-01-26) 핵심 철학: 감정 배제, 기계적 원칙 매매, 데이터 기반 의사결정
- (2026-01-26) 주요 구성 요소
  - Content Script: DOM 감시로 실시간 가격/차트 캡처, 버튼 클릭 시뮬레이션
  - Background Service Worker: 자동 매매 루프 및 탭 상태 관리
  - Side Panel UI: 시작/정지, 로그, 백테스트 결과 표시
  - Local DB: 티커 히스토리/거래/백테스트 결과 저장
- (2026-01-26) 핵심 기능
  - 데이터 수집: MutationObserver 또는 WebSocket 인터셉트
  - 티커 이동 자동화: 자산 선택 UI 제어 또는 URL 파라미터 조작
  - 자동 매매: 진입 조건 만족 시 CALL/PUT 주문, 슬리피지 및 리스크 관리
  - 지표 오버레이: 차트 위 캔버스 레이어, RSI/BB/MA 계산
  - 백테스팅/로깅: 로컬 데이터 기반 리플레이, 승률/손익 리포트
- (2026-01-26) DB 스키마 요약
  - ticks: ticker, timestamp, price, serverTime
  - strategies: name, config, description
  - sessions: type, startTime, endTime, initialBalance, finalBalance, winRate
  - trades: sessionId, ticker, direction, entry/exit time/price, result, profit, snapshot
- (2026-01-26) 백테스트 흐름: 데이터 로드 -> 시간 재생 -> 신호 -> 가상 주문 -> 결과 판정
- (2026-01-26) 포워드 테스트 흐름: 실시간 수집 -> 가상 주문 -> 만기 결과 업데이트
- (2026-01-26) 로드맵(요약): 기반 구축 -> 데이터 파이프라인 -> 분석/시각화 -> 자동화 -> 안정화/최적화

## 코드 스니펫

````text
// 필요한 경우 최소한의 예시만 기록
````

# 비트신옵션 채널 분석 - Findings

**생성일:** 2026-01-30
**채널:** https://www.youtube.com/@BITSHINOPTION
**상태:** 분석 대기 (브라우저 연결 필요)

---

## 채널 정보

- **이름:** 비트신옵션
- **URL:** @BITSHINOPTION
- **주제:** 바이너리 옵션 트레이딩 전략

---

## 수집 예정 항목

### 전략 영상 분류
- [ ] RSI 기반 전략
- [ ] 스토캐스틱 전략
- [ ] 볼린저밴드 전략
- [ ] 복합 인디케이터 전략
- [ ] 3스토캐스틱 전략
- [ ] 캔들 패턴 전략

### 각 영상별 수집 정보
```yaml
video:
  title: ""
  url: ""
  duration: ""
  
strategy:
  name: ""
  indicators:
    - name: ""
      settings: {}
  
  entry_conditions:
    call: []
    put: []
  
  exit:
    expiry: ""  # 1분, 5분 등
    
  notes: ""
  claimed_winrate: ""
```

---

## 분석 방법

1. **영상 자막 추출** (YouTube transcript)
2. **핵심 내용 요약**
3. **전략 구조화**
4. **백테스트 검증**
5. **RAG 시스템 등록**

---

## 임시: 일반적인 바이너리 옵션 전략들

### RSI 전략 (일반)
- RSI < 30 → CALL
- RSI > 70 → PUT
- 횡보장에서 효과적

### 스토캐스틱 전략 (일반)
- K < 20 + D < 20 → CALL
- K > 80 + D > 80 → PUT
- K가 D를 상향 교차 → CALL

### 볼린저밴드 전략 (일반)
- 하단 터치 + 반등 캔들 → CALL
- 상단 터치 + 하락 캔들 → PUT

### 복합 전략 (일반)
- RSI 과매도 + BB 하단 + 스토캐스틱 과매도 → 강한 CALL
- 3개 지표 모두 일치할 때만 진입

---

## 다음 단계

1. 유저가 특정 영상 링크 제공 시 자막 분석
2. 브라우저 릴레이로 채널 영상 목록 수집
3. 각 전략 백테스트 진행

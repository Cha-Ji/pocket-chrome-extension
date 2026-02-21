# Error Handling Contract

이 문서는 프로젝트 전체의 에러 처리 규칙을 정의한다.
`src/lib/errors/` 모듈의 `POError`, `Result<T>`, `errorHandler`를 기반으로 한다.

---

## 1. 에러 표현 방식: throw vs Result

| 상황 | 방식 | 이유 |
|------|------|------|
| **프로그래머 실수** (assert 위반, 불변 조건 깨짐) | `throw POError` | 호출자가 복구할 수 없으므로 빠르게 실패 |
| **외부 의존성 실패** (네트워크, DB, DOM) | `Result<T>` 반환 | 호출자가 실패를 예상하고 분기할 수 있어야 함 |
| **경계 함수** (public API, 콜백 진입점) | `try/catch` → `Result` 변환 | 내부 throw를 외부에 노출하지 않음 |

## 2. Silent Fail 금지

`catch` 블록에서 에러를 삼키는 것을 금지한다.

```typescript
// BAD — silent fail
try { await riskyOp(); }
catch (e) { console.log(`Error: ${e}`); }

// GOOD — errorHandler 경유, 콜백으로 전파
try { await riskyOp(); }
catch (e) {
  const poError = POError.from(e, { module: 'lib/trading', function: 'tick' });
  errorHandler.handle(poError);
  this.onError?.(poError);  // 상위 레이어에 전파
}
```

유일한 예외: `ignoreError()` 유틸을 사용하는 **명시적 무시** (로깅은 유지).

## 3. 에러 정규화

catch 블록에서 잡은 `unknown` 에러는 반드시 `POError.from()`으로 정규화한다.

```typescript
catch (error: unknown) {
  const poError = POError.from(error, {
    module: 'lib/trading',
    function: 'executeSignal',
  }, ErrorCode.TRADE_EXECUTION_FAILED);
  // ...
}
```

## 4. 경계(boundary)에서의 변환

| 경계 | 변환 규칙 |
|------|-----------|
| **public method** (start, stop, tick 등) | 내부 throw → catch → `errorHandler.handle()` + 콜백 전파 |
| **콜백 호출** (`onExecute`, `onResult`) | 외부 콜백의 throw → catch → POError로 wrap |
| **Chrome 메시지** | `POError.toJSON()` / `POError.fromJSON()` |
| **setTimeout/setInterval** | 내부에서 발생하는 에러를 반드시 catch |

## 5. ErrorModule 등록

새 모듈에서 POError를 사용할 때 `ErrorModule` 타입에 모듈명을 추가한다.

## 6. 적용 순서

1. **auto-trader.ts** (이 PR) — tick, executeSignal, simulateResult, loadHistory
2. executor.ts, background — 후속 PR
3. content-script — 후속 PR

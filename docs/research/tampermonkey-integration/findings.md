# Tampermonkey Integration Research

## 📌 개요
현재 Chrome Extension(`pocket-chrome-extension`)의 `content_scripts` 주입 시점(Race Condition) 문제를 해결하기 위해, 강력한 스크립트 주입 능력을 가진 **Tampermonkey(유저스크립트 관리자)**를 보조 도구로 활용하는 방안을 검토한다.

## 🧐 왜 Tampermonkey인가?
1.  **확실한 주입 시점 (`@run-at document-start`):**
    *   Tampermonkey는 브라우저 네이티브 수준에서 스크립트를 페이지 로드 최상단에 끼워 넣는 데 특화되어 있다.
    *   Chrome Extension의 `run_at: "document_start"`보다 더 빠르고 안정적으로 동작하는 경향이 있다.
2.  **보안 정책 우회:**
    *   Extension과 달리 `unsafeWindow` 객체를 통해 페이지의 전역 스코프(`window`)에 더 쉽고 강력하게 접근할 수 있다.
3.  **검증된 레거시:**
    *   이전 Python 프로젝트(`pocket-server`)에서도 이와 유사한 방식(Playwright Preload)으로 성공한 바 있다.

## 🛠️ 아키텍처 제안: "하이브리드 모델"

### 1. 역할 분담
| 컴포넌트 | 역할 | 위치 (World) |
| :--- | :--- | :--- |
| **Tampermonkey Script** | **스파이 (The Spy)**<br>- WebSocket 오버라이딩 (Hook)<br>- 데이터 탈취<br>- `postMessage`로 데이터 방출 | Main World |
| **Chrome Extension** | **수집가 (The Collector)**<br>- `postMessage` 수신<br>- 데이터 가공 및 저장 (DB)<br>- UI 제어 및 자동화 로직 | Isolated World |

### 2. 데이터 흐름
```mermaid
[Pocket Option Server]
       ↓ (WebSocket)
[Tampermonkey Script] (Hooked WebSocket)
       ↓ (window.postMessage)
[Chrome Extension] (Content Script)
       ↓ (chrome.runtime.sendMessage)
[Background Service Worker]
       ↓ (HTTP POST)
[Local Data Server] (SQLite)
```

## 📋 구현 상세 가이드

### 1. Tampermonkey 스크립트 작성 (`inject-websocket.user.js`)
```javascript
// ==UserScript==
// @name         Pocket Option WS Hook
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  WebSocket Hooking for Pocket Quant
// @author       Pocket Quant
// @match        https://pocketoption.com/*
// @match        https://po.trade/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';
    const win = unsafeWindow || window;
    
    // 이미 훅이 있다면 중단
    if (win.__pocketQuantWsHook) return;
    win.__pocketQuantWsHook = true;

    console.log('[TM-Spy] 🟢 Hooking Started via Tampermonkey');

    const OriginalWebSocket = win.WebSocket;
    win.WebSocket = function(...args) {
        const ws = new OriginalWebSocket(...args);
        const url = ws.url;
        
        ws.addEventListener('message', function(event) {
            // Extension으로 데이터 전송
            window.postMessage({
                source: 'pq-bridge',
                type: 'ws-message',
                data: {
                    url: url,
                    raw: event.data,
                    timestamp: Date.now()
                }
            }, '*');
        });
        
        return ws;
    };
    
    win.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(win.WebSocket, OriginalWebSocket);
})();
```

### 2. Extension 수정 (`manifest.json`)
*   기존의 `inject-websocket.js` 주입 로직을 **제거**하거나 **비활성화**한다. (충돌 방지)
*   `index.ts`는 오직 `window.addEventListener('message')`를 통해 데이터를 받아먹기만 하면 된다.

## ⚖️ 장단점 분석

### 장점 (Pros)
*   **성공률 99.9%:** WebSocket 생성 전에 확실하게 낚아챌 수 있다.
*   **개발 간소화:** Extension은 복잡한 주입 로직 신경 쓸 필요 없이 "데이터 처리"에만 집중하면 된다.

### 단점 (Cons)
*   **설치 번거로움:** 사용자가 Chrome Extension 외에 Tampermonkey 확장과 스크립트를 별도로 설치해야 한다. (배포 시 단점)
*   **의존성:** Tampermonkey가 꺼지면 수집도 멈춘다.

## 🚀 결론 및 추천
현재 `PO-16` 이슈(데이터 수집 실패)가 **"주입 타이밍"** 때문이라면, **Tampermonkey 도입은 가장 확실하고 빠른 해결책**이다.
우선 개발/테스트 단계에서는 Tampermonkey를 사용하여 데이터 수집을 안정화하고, 추후 Extension 단독 방식으로 고도화하는 것을 추천한다.

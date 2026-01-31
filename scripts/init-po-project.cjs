
const fs = require('fs');
const https = require('https');

const JIRA_CONFIG = require('/Users/kong-bee/.jira-cli.json');
const PROJECT_KEY = 'PO'; // User created key
const AUTH = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.password}`).toString('base64');

function jiraRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: JIRA_CONFIG.host,
      port: 443,
      path: `/rest/api/3${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          console.error(`Error ${res.statusCode}: ${data}`);
          reject(new Error(`Request failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const issues = [
  { summary: "[Core] Manifest V3 보안 정책 최적화 및 리소스 관리", desc: "보안 정책 최적화" },
  { summary: "[Core] 백그라운드 서비스 워커 생존 주기(Lifecycle) 개선", desc: "워커 생존 주기 개선" },
  { summary: "[Content] DOM 셀렉터 자동 복구(Auto-healing) 로직 구현", desc: "셀렉터 복구 로직" },
  { summary: "[Content] 다중 탭 간 데이터 동기화 및 충돌 방지", desc: "데이터 동기화" },
  { summary: "[Panel] 실시간 손익(P/L) 그래프 및 통계 카드 (대시보드)", desc: "대시보드 구현" },
  { summary: "[Panel] 거래 이력 로그 뷰어 및 CSV 내보내기", desc: "로그 뷰어" },
  { summary: "[Strategy] 사이드 패널 내 백테스팅 엔진 통합", desc: "백테스팅 통합" },
  { summary: "[Strategy] 머신러닝 기반 시그널 필터링 (경량화 모델)", desc: "ML 필터링" },
  { summary: "[Docs] 전략 가이드 및 API 문서화", desc: "문서화 작업" }
];

async function main() {
  console.log(`🚀 Initializing project ${PROJECT_KEY}...`);
  
  for (const issue of issues) {
    const body = {
      fields: {
        project: { key: PROJECT_KEY },
        summary: issue.summary,
        description: {
          type: "doc",
          version: 1,
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: issue.desc }]
          }]
        },
        issuetype: { name: "작업" }
      }
    };
    
    try {
      const res = await jiraRequest('POST', '/issue', body);
      console.log(`✅ Created ${res.key}: ${issue.summary}`);
    } catch (e) {
      console.error(`❌ Failed to create ${issue.summary}`);
    }
  }
  
  console.log("\n✨ PO Project Initialization Complete!");
}

main();

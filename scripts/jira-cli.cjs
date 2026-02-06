#!/usr/bin/env node

/**
 * Jira CLI - 이슈 생성, 업데이트, 조회를 위한 커맨드라인 도구
 * 
 * 사용법:
 *   node scripts/jira-cli.cjs <command> [options]
 * 
 * 명령어:
 *   get <issue-key>                    이슈 상세 조회
 *   list [options]                     이슈 목록 조회
 *   create [options]                   이슈 생성
 *   update <issue-key> [options]       이슈 상태 변경
 *   comment <issue-key> [options]      댓글 추가
 *   help                               도움말 표시
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// --- Configuration ---
const ENV_PATH = path.join(__dirname, '..', '.env');
const DEFAULT_PROJECT = 'PO';

// Issue Type IDs (PO-CHROME project)
const ISSUE_TYPES = {
  Task: '10038',
  Epic: '10039',
  Subtask: '10040'
};

// --- Load .env file ---
function loadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
}

// --- Load Config ---
function loadConfig() {
  loadEnv();
  
  const host = process.env.JIRA_HOST;
  const username = process.env.JIRA_USERNAME;
  const password = process.env.JIRA_API_TOKEN;
  
  if (!host || !username || !password) {
    console.error('Jira 설정이 없습니다.');
    console.error(`\n프로젝트 루트의 .env 파일에 다음을 추가하세요:`);
    console.error(`
JIRA_HOST=auto-trade-extension.atlassian.net
JIRA_USERNAME=your-email@example.com
JIRA_API_TOKEN=your-api-token
`);
    console.error('API 토큰: https://id.atlassian.com/manage-profile/security/api-tokens');
    process.exit(1);
  }
  
  return { host, username, password };
}

// --- HTTP Helper ---
function jiraRequest(config, method, endpoint, body) {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.host,
      port: 443,
      path: `/rest/api/3${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (res.statusCode === 204 || !data) {
            resolve({});
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              console.error('JSON Parse Error:', data);
              reject(e);
            }
          }
        } else {
          console.error(`HTTP ${res.statusCode}: ${data}`);
          reject(new Error(`Request failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Commands ---

/**
 * 이슈 상세 조회
 */
async function getIssue(config, issueKey) {
  const fields = 'summary,status,assignee,reporter,created,updated,description,issuetype,parent,labels';
  const issue = await jiraRequest(config, 'GET', `/issue/${issueKey}?fields=${fields}`);
  
  console.log(`\n=== ${issue.key}: ${issue.fields.summary} ===`);
  console.log(`타입: ${issue.fields.issuetype?.name || 'N/A'}`);
  console.log(`상태: ${issue.fields.status?.name || 'N/A'}`);
  console.log(`담당자: ${issue.fields.assignee?.displayName || '없음'}`);
  console.log(`보고자: ${issue.fields.reporter?.displayName || 'N/A'}`);
  console.log(`생성일: ${issue.fields.created}`);
  console.log(`수정일: ${issue.fields.updated}`);
  if (issue.fields.parent) {
    console.log(`상위 이슈: ${issue.fields.parent.key}`);
  }
  if (issue.fields.labels?.length > 0) {
    console.log(`라벨: ${issue.fields.labels.join(', ')}`);
  }
  
  // Description (ADF to plain text)
  if (issue.fields.description?.content) {
    const text = extractTextFromADF(issue.fields.description);
    if (text) {
      console.log(`\n설명:\n${text}`);
    }
  }
  
  return issue;
}

/**
 * ADF (Atlassian Document Format)에서 텍스트 추출
 */
function extractTextFromADF(adf) {
  if (!adf || !adf.content) return '';
  
  function extractFromNode(node) {
    if (node.type === 'text') return node.text || '';
    if (node.content) {
      return node.content.map(extractFromNode).join('');
    }
    return '';
  }
  
  return adf.content.map(extractFromNode).join('\n').trim();
}

/**
 * 이슈 목록 조회 (JQL 검색)
 */
async function listIssues(config, options) {
  const project = options.project || DEFAULT_PROJECT;
  const status = options.status;
  const maxResults = options.max || 20;
  
  let jql = `project = ${project}`;
  if (status) {
    jql += ` AND status = "${status}"`;
  }
  jql += ' ORDER BY updated DESC';
  
  // New API: POST /search/jql (old /search is deprecated)
  const body = {
    jql: jql,
    maxResults: maxResults,
    fields: ['key', 'summary', 'status', 'issuetype', 'assignee']
  };
  const result = await jiraRequest(config, 'POST', '/search/jql', body);
  
  console.log(`\n=== ${project} 프로젝트 이슈 (${result.issues.length}/${result.total}) ===\n`);
  
  for (const issue of result.issues) {
    const type = issue.fields.issuetype?.name?.substring(0, 4) || '    ';
    const status = issue.fields.status?.name || 'N/A';
    const assignee = issue.fields.assignee?.displayName || '-';
    console.log(`[${issue.key}] [${type}] [${status}] ${issue.fields.summary}`);
    console.log(`         담당: ${assignee}`);
  }
  
  return result;
}

/**
 * 이슈 생성
 */
async function createIssue(config, options) {
  const project = options.project || DEFAULT_PROJECT;
  const summary = options.summary;
  const type = options.type || 'Task';
  const description = options.description || '';
  const parent = options.parent;
  const labels = options.labels ? options.labels.split(',') : [];
  
  if (!summary) {
    console.error('오류: --summary 옵션이 필요합니다.');
    process.exit(1);
  }
  
  const typeId = ISSUE_TYPES[type];
  if (!typeId) {
    console.error(`오류: 지원하지 않는 이슈 타입입니다: ${type}`);
    console.error(`지원 타입: ${Object.keys(ISSUE_TYPES).join(', ')}`);
    process.exit(1);
  }
  
  const body = {
    fields: {
      project: { key: project },
      summary: summary,
      issuetype: { id: typeId }
    }
  };
  
  if (description) {
    body.fields.description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }]
        }
      ]
    };
  }
  
  if (parent) {
    body.fields.parent = { key: parent };
  }
  
  if (labels.length > 0) {
    body.fields.labels = labels;
  }
  
  const result = await jiraRequest(config, 'POST', '/issue', body);
  
  console.log(`\n이슈 생성 완료: ${result.key}`);
  console.log(`URL: https://${config.host}/browse/${result.key}`);
  
  return result;
}

/**
 * 이슈 상태 변경
 */
async function updateIssue(config, issueKey, options) {
  const status = options.status;
  
  if (!status) {
    console.error('오류: --status 옵션이 필요합니다.');
    process.exit(1);
  }
  
  // 1. 가능한 전환 상태 조회
  const transitions = await jiraRequest(config, 'GET', `/issue/${issueKey}/transitions`);
  
  // 2. 매칭되는 전환 찾기
  const target = transitions.transitions.find(t =>
    t.name.toLowerCase() === status.toLowerCase() ||
    t.name === status ||
    (status.toLowerCase() === 'done' && (t.name === '완료' || t.name === 'Done')) ||
    (status.toLowerCase() === 'in progress' && (t.name === '진행 중' || t.name === 'In Progress')) ||
    (status.toLowerCase() === 'to do' && (t.name === '해야 할 일' || t.name === 'To Do'))
  );
  
  if (!target) {
    console.error(`오류: '${status}' 상태로 전환할 수 없습니다.`);
    console.error(`가능한 상태: ${transitions.transitions.map(t => t.name).join(', ')}`);
    process.exit(1);
  }
  
  // 3. 상태 전환 실행
  await jiraRequest(config, 'POST', `/issue/${issueKey}/transitions`, {
    transition: { id: target.id }
  });
  
  console.log(`\n${issueKey} 상태 변경: ${target.name}`);
  
  return { key: issueKey, status: target.name };
}

/**
 * 댓글 추가
 */
async function addComment(config, issueKey, options) {
  const body = options.body;
  
  if (!body) {
    console.error('오류: --body 옵션이 필요합니다.');
    process.exit(1);
  }
  
  const commentBody = {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: body }]
        }
      ]
    }
  };
  
  const result = await jiraRequest(config, 'POST', `/issue/${issueKey}/comment`, commentBody);
  
  console.log(`\n${issueKey}에 댓글 추가 완료`);
  console.log(`댓글 ID: ${result.id}`);
  
  return result;
}

/**
 * 도움말 표시
 */
function showHelp() {
  console.log(`
Jira CLI - 이슈 생성, 업데이트, 조회를 위한 커맨드라인 도구

사용법:
  node scripts/jira-cli.cjs <command> [options]

명령어:
  get <issue-key>
    이슈 상세 정보를 조회합니다.
    예: node scripts/jira-cli.cjs get SCRUM-1

  list [options]
    이슈 목록을 조회합니다.
    옵션:
      --project=<key>   프로젝트 키 (기본: SCRUM)
      --status=<name>   상태 필터 (예: "To Do", "In Progress", "Done")
      --max=<number>    최대 결과 수 (기본: 20)
    예: node scripts/jira-cli.cjs list --project=SCRUM --status="In Progress"

  create [options]
    새 이슈를 생성합니다.
    옵션:
      --summary=<text>       이슈 제목 (필수)
      --type=<type>          이슈 타입 (Epic, Task, Bug, Subtask) (기본: Task)
      --description=<text>   이슈 설명
      --parent=<key>         상위 이슈 키 (Epic 하위 Task 생성 시)
      --labels=<list>        라벨 (쉼표로 구분)
      --project=<key>        프로젝트 키 (기본: SCRUM)
    예: node scripts/jira-cli.cjs create --summary="새 기능 구현" --type=Task --parent=SCRUM-1

  update <issue-key> [options]
    이슈 상태를 변경합니다.
    옵션:
      --status=<name>   변경할 상태 (예: "In Progress", "Done")
    예: node scripts/jira-cli.cjs update SCRUM-1 --status="In Progress"

  comment <issue-key> [options]
    이슈에 댓글을 추가합니다.
    옵션:
      --body=<text>     댓글 내용 (필수)
    예: node scripts/jira-cli.cjs comment SCRUM-1 --body="작업 완료했습니다."

  help
    이 도움말을 표시합니다.

설정:
  프로젝트 루트의 .env 파일에 다음을 추가하세요:

  JIRA_HOST=auto-trade-extension.atlassian.net
  JIRA_USERNAME=your-email@example.com
  JIRA_API_TOKEN=your-api-token

  API 토큰은 https://id.atlassian.com/manage-profile/security/api-tokens 에서 생성할 수 있습니다.
`);
}

// --- Argument Parser ---
function parseArgs(args) {
  const result = { _: [] };
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      result[key] = valueParts.join('=') || true;
    } else {
      result._.push(arg);
    }
  }
  
  return result;
}

// --- Main ---
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  
  if (!command || command === 'help') {
    showHelp();
    return;
  }
  
  const config = loadConfig();
  
  try {
    switch (command) {
      case 'get': {
        const issueKey = args._[1];
        if (!issueKey) {
          console.error('오류: 이슈 키가 필요합니다. 예: node scripts/jira-cli.cjs get SCRUM-1');
          process.exit(1);
        }
        await getIssue(config, issueKey);
        break;
      }
      
      case 'list': {
        await listIssues(config, args);
        break;
      }
      
      case 'create': {
        await createIssue(config, args);
        break;
      }
      
      case 'update': {
        const issueKey = args._[1];
        if (!issueKey) {
          console.error('오류: 이슈 키가 필요합니다. 예: node scripts/jira-cli.cjs update SCRUM-1 --status="Done"');
          process.exit(1);
        }
        await updateIssue(config, issueKey, args);
        break;
      }
      
      case 'comment': {
        const issueKey = args._[1];
        if (!issueKey) {
          console.error('오류: 이슈 키가 필요합니다. 예: node scripts/jira-cli.cjs comment SCRUM-1 --body="내용"');
          process.exit(1);
        }
        await addComment(config, issueKey, args);
        break;
      }
      
      default:
        console.error(`알 수 없는 명령어: ${command}`);
        console.error('도움말: node scripts/jira-cli.cjs help');
        process.exit(1);
    }
  } catch (error) {
    console.error(`\n오류 발생: ${error.message}`);
    process.exit(1);
  }
}

main();

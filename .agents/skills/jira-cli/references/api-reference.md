# Jira REST API Reference

이 문서는 jira-cli.cjs에서 사용하는 Jira REST API v3 엔드포인트를 설명합니다.

## 인증

Basic Authentication을 사용합니다:

```
Authorization: Basic base64(email:api-token)
```

## API 엔드포인트

Base URL: `https://{host}/rest/api/3`

### 이슈 조회

```
GET /issue/{issueIdOrKey}
```

**Query Parameters:**
- `fields`: 반환할 필드 (쉼표로 구분)
  - 예: `summary,status,assignee,reporter,created,updated,description,issuetype,parent,labels`

**Response:**
```json
{
  "key": "SCRUM-1",
  "fields": {
    "summary": "이슈 제목",
    "status": { "name": "To Do" },
    "issuetype": { "name": "Task" },
    "assignee": { "displayName": "담당자" },
    "reporter": { "displayName": "보고자" },
    "created": "2024-01-15T10:30:00.000Z",
    "updated": "2024-01-16T14:20:00.000Z",
    "description": { "type": "doc", "version": 1, "content": [...] },
    "parent": { "key": "SCRUM-EPIC" },
    "labels": ["frontend", "urgent"]
  }
}
```

### 이슈 검색 (JQL)

```
GET /search?jql={jql}&maxResults={max}&fields={fields}
```

**JQL 예시:**
- `project = SCRUM` - 프로젝트 필터
- `status = "In Progress"` - 상태 필터
- `assignee = currentUser()` - 내 이슈
- `ORDER BY updated DESC` - 정렬

**Response:**
```json
{
  "total": 50,
  "maxResults": 20,
  "issues": [
    {
      "key": "SCRUM-1",
      "fields": { ... }
    }
  ]
}
```

### 이슈 생성

```
POST /issue
```

**Request Body:**
```json
{
  "fields": {
    "project": { "key": "SCRUM" },
    "summary": "이슈 제목",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "설명 내용" }]
        }
      ]
    },
    "issuetype": { "id": "10003" },
    "parent": { "key": "SCRUM-EPIC" },
    "labels": ["frontend"]
  }
}
```

**Issue Type IDs:**
| 타입 | ID |
|------|------|
| Epic | 10001 |
| Subtask | 10002 |
| Task | 10003 |
| Bug | 10004 |

**Response:**
```json
{
  "id": "10001",
  "key": "SCRUM-1",
  "self": "https://..."
}
```

### 상태 전환 조회

```
GET /issue/{issueIdOrKey}/transitions
```

**Response:**
```json
{
  "transitions": [
    { "id": "11", "name": "To Do" },
    { "id": "21", "name": "In Progress" },
    { "id": "31", "name": "Done" }
  ]
}
```

### 상태 전환 실행

```
POST /issue/{issueIdOrKey}/transitions
```

**Request Body:**
```json
{
  "transition": { "id": "21" }
}
```

### 댓글 추가

```
POST /issue/{issueIdOrKey}/comment
```

**Request Body:**
```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "댓글 내용" }]
      }
    ]
  }
}
```

**Response:**
```json
{
  "id": "10001",
  "body": { ... },
  "created": "2024-01-15T10:30:00.000Z"
}
```

## Atlassian Document Format (ADF)

Jira API v3는 설명과 댓글에 ADF 형식을 사용합니다.

### 기본 구조

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "일반 텍스트" }
      ]
    }
  ]
}
```

### 지원 노드 타입

- `paragraph` - 단락
- `heading` - 제목 (attrs: { level: 1-6 })
- `bulletList` - 비순서 목록
- `orderedList` - 순서 목록
- `listItem` - 목록 항목
- `codeBlock` - 코드 블록
- `blockquote` - 인용
- `rule` - 수평선
- `text` - 텍스트 (marks: bold, italic, code, link 등)

### 예시: 복잡한 ADF

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "작업 내용" }]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "항목 1" }]
            }
          ]
        }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "javascript" },
      "content": [{ "type": "text", "text": "console.log('hello');" }]
    }
  ]
}
```

## 에러 처리

### 일반적인 HTTP 상태 코드

| 코드 | 의미 |
|------|------|
| 200 | 성공 |
| 201 | 생성됨 |
| 204 | 성공 (본문 없음) |
| 400 | 잘못된 요청 |
| 401 | 인증 실패 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 429 | 요청 한도 초과 |

### 에러 응답 예시

```json
{
  "errorMessages": ["Issue does not exist or you do not have permission to see it."],
  "errors": {}
}
```

## Rate Limiting

Jira Cloud는 분당 요청 수를 제한합니다:
- 기본: 분당 ~100 요청
- 429 응답 시 잠시 대기 후 재시도

## 참고 링크

- [Jira Cloud REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [ADF (Atlassian Document Format)](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- [JQL Reference](https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/)


const fs = require('fs');
const path = require('path');
const https = require('https');

// --- Configuration ---
const JIRA_CONFIG = require('/Users/kong-bee/.jira-cli.json');
const PROJECT_KEY = 'SCRUM';
const SOURCE_FILE = path.join(__dirname, '../docs/task_plan.md');

// Auth Header
const AUTH = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.password}`).toString('base64');

// --- Helpers ---
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
          console.error(`Error: ${res.statusCode} ${data}`);
          reject(new Error(`Request failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseMarkdown(content) {
  const lines = content.split('\n');
  const epics = [];
  let currentEpic = null;

  lines.forEach(line => {
    // Detect Phase (Epic)
    const epicMatch = line.match(/^##\s+(Phase\s+\d+:\s+.*)/);
    if (epicMatch) {
      currentEpic = {
        name: epicMatch[1].trim().replace(/✅|🔄/g, '').trim(),
        tasks: []
      };
      epics.push(currentEpic);
      return;
    }

    // Detect Task
    const taskMatch = line.match(/^-\s+\[([ x~])\]\s+(.*)/);
    if (taskMatch && currentEpic) {
      const statusChar = taskMatch[1];
      const title = taskMatch[2].trim();
      let status = 'To Do';
      if (statusChar === 'x') status = 'Done';
      if (statusChar === '~') status = 'In Progress'; // Map to In Progress if available

      currentEpic.tasks.push({
        title,
        status,
        originalLine: line
      });
    }
  });

  return epics;
}

async function createIssue(summary, description, typeId, parentId = null) {
  const body = {
    fields: {
      project: { key: PROJECT_KEY },
      summary: summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: description || "Imported from task_plan.md" }
            ]
          }
        ]
      },
      issuetype: { id: typeId }
    }
  };

  if (parentId) {
    body.fields.parent = { key: parentId };
  }

  const result = await jiraRequest('POST', '/issue', body);
  return result;
}

async function transitionIssue(issueKey, statusName) {
  // 1. Get transitions
  const transitions = await jiraRequest('GET', `/issue/${issueKey}/transitions`);
  
  // 2. Find matching transition (Loose matching)
  // Standard IDs: 11 (To Do), 21 (In Progress), 31 (Done) - may vary by project
  const target = transitions.transitions.find(t => 
    t.name.toLowerCase() === statusName.toLowerCase() ||
    (statusName === 'Done' && t.name === '완료') ||
    (statusName === 'In Progress' && t.name === '진행 중')
  );

  if (target) {
    await jiraRequest('POST', `/issue/${issueKey}/transitions`, {
      transition: { id: target.id }
    });
    console.log(`  -> Status updated to ${target.name}`);
  } else {
    console.warn(`  -> Warning: Transition '${statusName}' not found for ${issueKey}. Available: ${transitions.transitions.map(t => t.name).join(', ')}`);
  }
}

// --- Main ---
async function main() {
  console.log(`Reading ${SOURCE_FILE}...`);
  const content = fs.readFileSync(SOURCE_FILE, 'utf8');
  const epics = parseMarkdown(content);

  console.log(`Found ${epics.length} Phases (Epics). Starting migration...`);

  // Issue Type IDs from previous 'findings'
  const TYPE_EPIC = '10001';
  const TYPE_TASK = '10003';

  for (const epic of epics) {
    console.log(`\nCreating Epic: ${epic.name}`);
    
    // 1. Create Epic
    const epicIssue = await createIssue(`[Phase] ${epic.name}`, "Imported Phase from task_plan.md", TYPE_EPIC);
    console.log(`  -> Created ${epicIssue.key}`);

    // 2. Create Tasks
    for (const task of epic.tasks) {
        // Only migrate NOT DONE tasks to avoid clutter? 
        // User asked to "leave record", so we migrate ALL.
        
        console.log(`  Creating Task: ${task.title}`);
        const taskIssue = await createIssue(task.title, "", TYPE_TASK, epicIssue.key);
        console.log(`    -> Created ${taskIssue.key}`);

        // 3. Update Status
        if (task.status !== 'To Do') {
            await transitionIssue(taskIssue.key, task.status);
        }
    }
  }
  
  console.log("\nMigration Complete! 🚀");
}

main().catch(console.error);

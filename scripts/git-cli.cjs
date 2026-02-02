#!/usr/bin/env node

/**
 * Git CLI - 토큰 최적화된 Git/GitHub 작업 도구
 * 
 * 사용법:
 *   node scripts/git-cli.cjs <command> [options]
 * 
 * 명령어:
 *   status                          변경 상태 요약
 *   diff [options]                  변경사항 요약
 *   log [options]                   커밋 히스토리
 *   commit [options]                커밋 생성
 *   push [options]                  원격 푸시
 *   pr-create [options]             PR 생성
 *   pr-list [options]               PR 목록
 *   pr-view <number>                PR 상세
 *   pr-merge <number> [options]     PR 머지
 *   pr-review <number> [options]    PR 리뷰
 *   help                            도움말
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

// --- Platform Detection ---
const IS_WINDOWS = process.platform === 'win32';

// --- Helpers ---

/**
 * Windows 경로를 WSL 경로로 변환
 */
function toWslPath(winPath) {
  // C:\Users\... -> /mnt/c/Users/...
  return winPath
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');
}

/**
 * Git 명령어 실행
 */
function git(args, options = {}) {
  try {
    const result = execSync(`git ${args}`, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return result.trim();
  } catch (error) {
    if (options.ignoreError) {
      return error.stdout?.trim() || '';
    }
    throw error;
  }
}

// WSL 배포판 이름 (Ubuntu 사용)
const WSL_DISTRO = 'Ubuntu';

/**
 * gh CLI 명령어 실행 (Windows에서는 WSL Ubuntu 사용)
 */
function gh(args, options = {}) {
  try {
    let command;
    if (IS_WINDOWS) {
      // Windows: WSL Ubuntu를 통해 gh 실행
      const cwd = process.cwd();
      const wslPath = toWslPath(cwd);
      // 인터랙티브 로그인 쉘로 실행하여 PATH와 환경변수 로드
      command = `wsl -d ${WSL_DISTRO} -- bash -ic "cd '${wslPath}' && gh ${args}"`;
    } else {
      command = `gh ${args}`;
    }
    
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return result.trim();
  } catch (error) {
    const errMsg = error.message || '';
    if (errMsg.includes("'gh'") || errMsg.includes("gh: not found") || errMsg.includes("command not found")) {
      console.error('오류: gh CLI가 설치되어 있지 않습니다.');
      if (IS_WINDOWS) {
        console.error('\nWSL Ubuntu에서 gh 설치:');
        console.error('  # WSL Ubuntu 터미널에서 실행');
        console.error('  sudo apt update && sudo apt install gh');
        console.error('  # 또는 Homebrew 사용 시');
        console.error('  brew install gh');
      } else {
        console.error('\n설치 방법:');
        console.error('  brew install gh      # macOS');
        console.error('  sudo apt install gh  # Ubuntu/Debian');
      }
      console.error('\n설치 후 인증:');
      console.error('  gh auth login');
      process.exit(1);
    }
    throw error;
  }
}

/**
 * gh CLI 설치 여부 확인 (Windows에서는 WSL Ubuntu 확인)
 */
function checkGhCli() {
  try {
    if (IS_WINDOWS) {
      execSync(`wsl -d ${WSL_DISTRO} -- bash -ic "gh --version"`, { stdio: 'pipe' });
    } else {
      execSync('gh --version', { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

// --- Commands ---

/**
 * git status 요약
 */
function gitStatus() {
  const branch = git('branch --show-current');
  const status = git('status --porcelain');
  
  if (!status) {
    console.log(`\n=== ${branch} ===`);
    console.log('변경사항 없음 (clean)');
    return;
  }
  
  const lines = status.split('\n').filter(Boolean);
  const staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?');
  const unstaged = lines.filter(l => l[0] === ' ' || (l[0] !== '?' && l[1] !== ' '));
  const untracked = lines.filter(l => l.startsWith('??'));
  
  console.log(`\n=== ${branch} ===`);
  console.log(`staged: ${staged.length}, unstaged: ${unstaged.length - staged.length}, untracked: ${untracked.length}`);
  
  if (staged.length > 0) {
    console.log('\n[Staged]');
    staged.slice(0, 10).forEach(l => console.log(`  ${l}`));
    if (staged.length > 10) console.log(`  ... +${staged.length - 10} more`);
  }
  
  if (unstaged.length > staged.length) {
    console.log('\n[Unstaged]');
    const modified = lines.filter(l => l[0] === ' ' && l[1] === 'M');
    modified.slice(0, 10).forEach(l => console.log(`  ${l}`));
    if (modified.length > 10) console.log(`  ... +${modified.length - 10} more`);
  }
  
  if (untracked.length > 0) {
    console.log('\n[Untracked]');
    untracked.slice(0, 5).forEach(l => console.log(`  ${l.slice(3)}`));
    if (untracked.length > 5) console.log(`  ... +${untracked.length - 5} more`);
  }
}

/**
 * git diff 요약
 */
function gitDiff(options) {
  const staged = options.staged;
  const file = options.file;
  
  let args = staged ? 'diff --cached --stat' : 'diff --stat';
  if (file) args += ` -- "${file}"`;
  
  const stat = git(args);
  
  if (!stat) {
    console.log(staged ? '스테이징된 변경사항 없음' : '변경사항 없음');
    return;
  }
  
  console.log(`\n=== Diff ${staged ? '(Staged)' : '(Working)'} ===\n`);
  console.log(stat);
  
  // 상세 diff 필요시
  if (options.detail) {
    const detailArgs = staged ? 'diff --cached' : 'diff';
    const detail = git(file ? `${detailArgs} -- "${file}"` : detailArgs);
    const lines = detail.split('\n');
    
    // 최대 100줄로 제한
    if (lines.length > 100) {
      console.log('\n[상세 변경사항 (처음 100줄)]');
      console.log(lines.slice(0, 100).join('\n'));
      console.log(`\n... +${lines.length - 100} lines more`);
    } else {
      console.log('\n[상세 변경사항]');
      console.log(detail);
    }
  }
}

/**
 * git log 간결 출력
 */
function gitLog(options) {
  const max = options.max || 20;
  const oneline = options.oneline !== false;
  const graph = options.graph !== false;
  
  let args = `log -n ${max}`;
  if (oneline) args += ' --oneline';
  if (graph) args += ' --graph';
  if (options.author) args += ` --author="${options.author}"`;
  if (options.since) args += ` --since="${options.since}"`;
  if (options.until) args += ` --until="${options.until}"`;
  
  const result = git(args);
  
  console.log(`\n=== 최근 커밋 (${max}개) ===\n`);
  console.log(result || '커밋 없음');
}

/**
 * 커밋 생성
 */
function gitCommit(options) {
  const message = options.message || options.m;
  const all = options.all || options.a;
  
  if (!message) {
    // 변경사항 분석 후 메시지 제안
    const staged = git('diff --cached --stat');
    const stagedFiles = git('diff --cached --name-only');
    
    if (!staged) {
      console.error('오류: 스테이징된 변경사항이 없습니다.');
      console.error('먼저 git add를 실행하세요.');
      process.exit(1);
    }
    
    console.log('\n=== 스테이징된 변경사항 ===\n');
    console.log(staged);
    
    // Conventional Commits 타입 추천
    const files = stagedFiles.split('\n').filter(Boolean);
    let suggestedType = 'chore';
    
    if (files.some(f => f.includes('test'))) suggestedType = 'test';
    else if (files.some(f => f.includes('.md') || f.includes('doc'))) suggestedType = 'docs';
    else if (files.some(f => f.includes('fix') || f.includes('bug'))) suggestedType = 'fix';
    else if (files.length > 0) suggestedType = 'feat';
    
    // 스코프 추천
    const dirs = [...new Set(files.map(f => f.split('/')[0]))];
    const suggestedScope = dirs.length === 1 ? dirs[0] : '';
    
    console.log('\n[Conventional Commits 제안]');
    console.log(`타입: ${suggestedType}`);
    if (suggestedScope) console.log(`스코프: ${suggestedScope}`);
    console.log(`\n예시: ${suggestedType}${suggestedScope ? `(${suggestedScope})` : ''}: <설명>`);
    console.log('\n사용법: node scripts/git-cli.cjs commit --message="feat(scope): 설명"');
    return;
  }
  
  let args = 'commit';
  if (all) args += ' -a';
  args += ` -m "${message.replace(/"/g, '\\"')}"`;
  
  try {
    const result = git(args);
    console.log('\n커밋 완료:');
    console.log(result);
  } catch (error) {
    console.error('커밋 실패:', error.message);
    process.exit(1);
  }
}

/**
 * git push
 */
function gitPush(options) {
  const force = options.force || options.f;
  const setUpstream = options.u || options['set-upstream'];
  const remote = options.remote || 'origin';
  const branch = options.branch || git('branch --show-current');
  
  // 푸시 전 상태 확인
  const status = git('status --porcelain');
  if (status) {
    console.log('경고: 커밋되지 않은 변경사항이 있습니다.');
    console.log(`변경 파일: ${status.split('\n').filter(Boolean).length}개`);
  }
  
  // 원격 브랜치 존재 여부 확인
  let hasRemote = false;
  try {
    git(`ls-remote --exit-code --heads ${remote} ${branch}`, { silent: true });
    hasRemote = true;
  } catch {
    hasRemote = false;
  }
  
  let args = 'push';
  if (force) {
    console.log('경고: force push를 실행합니다.');
    args += ' --force';
  }
  if (setUpstream || !hasRemote) {
    args += ` -u ${remote} ${branch}`;
  }
  
  try {
    console.log(`\n${remote}/${branch}로 푸시 중...`);
    const result = execSync(`git ${args}`, { encoding: 'utf8', stdio: 'inherit' });
    console.log('\n푸시 완료');
  } catch (error) {
    console.error('푸시 실패');
    process.exit(1);
  }
}

/**
 * PR 생성
 */
function prCreate(options) {
  if (!checkGhCli()) {
    console.error('오류: gh CLI가 필요합니다.');
    console.error('설치: winget install GitHub.cli');
    process.exit(1);
  }
  
  const title = options.title || options.t;
  const body = options.body || options.b;
  const base = options.base || 'main';
  const draft = options.draft || options.d;
  
  if (!title) {
    // 최근 커밋에서 제목 추천
    const lastCommit = git('log -1 --format=%s');
    const branch = git('branch --show-current');
    
    console.log('\n=== PR 생성 ===');
    console.log(`현재 브랜치: ${branch}`);
    console.log(`대상 브랜치: ${base}`);
    console.log(`최근 커밋: ${lastCommit}`);
    console.log('\n사용법:');
    console.log(`  node scripts/git-cli.cjs pr-create --title="PR 제목" --base=${base}`);
    console.log('\n옵션:');
    console.log('  --body="PR 설명"');
    console.log('  --draft  (드래프트로 생성)');
    return;
  }
  
  let args = `pr create --title "${title.replace(/"/g, '\\"')}" --base ${base}`;
  if (body) args += ` --body "${body.replace(/"/g, '\\"')}"`;
  if (draft) args += ' --draft';
  
  try {
    const result = gh(args);
    console.log('\nPR 생성 완료:');
    console.log(result);
  } catch (error) {
    console.error('PR 생성 실패:', error.message);
    process.exit(1);
  }
}

/**
 * PR 목록
 */
function prList(options) {
  if (!checkGhCli()) {
    console.error('오류: gh CLI가 필요합니다.');
    process.exit(1);
  }
  
  const state = options.state || 'open';
  const max = options.max || 20;
  
  const result = gh(`pr list --state ${state} --limit ${max} --json number,title,state,author,updatedAt`);
  const prs = JSON.parse(result || '[]');
  
  console.log(`\n=== PR 목록 (${state}) ===\n`);
  
  if (prs.length === 0) {
    console.log('PR 없음');
    return;
  }
  
  for (const pr of prs) {
    const date = new Date(pr.updatedAt).toLocaleDateString();
    console.log(`#${pr.number} [${pr.state}] ${pr.title}`);
    console.log(`    작성자: ${pr.author?.login || 'unknown'}, 수정: ${date}`);
  }
}

/**
 * PR 상세
 */
function prView(prNumber) {
  if (!checkGhCli()) {
    console.error('오류: gh CLI가 필요합니다.');
    process.exit(1);
  }
  
  if (!prNumber) {
    console.error('오류: PR 번호가 필요합니다.');
    console.error('사용법: node scripts/git-cli.cjs pr-view 123');
    process.exit(1);
  }
  
  const result = gh(`pr view ${prNumber} --json number,title,state,body,author,baseRefName,headRefName,additions,deletions,changedFiles,reviewDecision,updatedAt`);
  const pr = JSON.parse(result);
  
  console.log(`\n=== PR #${pr.number}: ${pr.title} ===`);
  console.log(`상태: ${pr.state}`);
  console.log(`브랜치: ${pr.headRefName} → ${pr.baseRefName}`);
  console.log(`작성자: ${pr.author?.login || 'unknown'}`);
  console.log(`변경: +${pr.additions} -${pr.deletions} (${pr.changedFiles} files)`);
  if (pr.reviewDecision) console.log(`리뷰: ${pr.reviewDecision}`);
  console.log(`수정일: ${new Date(pr.updatedAt).toLocaleString()}`);
  
  if (pr.body) {
    const bodyLines = pr.body.split('\n');
    console.log('\n[설명]');
    if (bodyLines.length > 10) {
      console.log(bodyLines.slice(0, 10).join('\n'));
      console.log(`... +${bodyLines.length - 10} lines more`);
    } else {
      console.log(pr.body);
    }
  }
}

/**
 * PR 머지
 */
function prMerge(prNumber, options) {
  if (!checkGhCli()) {
    console.error('오류: gh CLI가 필요합니다.');
    process.exit(1);
  }
  
  if (!prNumber) {
    console.error('오류: PR 번호가 필요합니다.');
    console.error('사용법: node scripts/git-cli.cjs pr-merge 123');
    process.exit(1);
  }
  
  const method = options.method || 'merge'; // merge, squash, rebase
  const deleteBranch = options['delete-branch'] || options.d;
  
  let args = `pr merge ${prNumber} --${method}`;
  if (deleteBranch) args += ' --delete-branch';
  
  try {
    console.log(`\nPR #${prNumber} 머지 중... (${method})`);
    const result = gh(args);
    console.log('머지 완료');
    if (result) console.log(result);
  } catch (error) {
    console.error('머지 실패:', error.message);
    process.exit(1);
  }
}

/**
 * PR 리뷰
 */
function prReview(prNumber, options) {
  if (!checkGhCli()) {
    console.error('오류: gh CLI가 필요합니다.');
    process.exit(1);
  }
  
  if (!prNumber) {
    console.error('오류: PR 번호가 필요합니다.');
    console.error('사용법: node scripts/git-cli.cjs pr-review 123 --approve');
    process.exit(1);
  }
  
  const approve = options.approve || options.a;
  const requestChanges = options['request-changes'] || options.r;
  const comment = options.comment || options.c;
  const body = options.body || options.b;
  
  if (!approve && !requestChanges && !comment) {
    // PR diff 보여주기
    console.log(`\n=== PR #${prNumber} 리뷰 ===`);
    const diff = gh(`pr diff ${prNumber} --stat`, { ignoreError: true });
    console.log(diff || 'diff 없음');
    
    console.log('\n[리뷰 옵션]');
    console.log('  --approve        승인');
    console.log('  --request-changes  변경 요청');
    console.log('  --comment        코멘트');
    console.log('  --body="내용"    리뷰 메시지');
    return;
  }
  
  let args = `pr review ${prNumber}`;
  if (approve) args += ' --approve';
  else if (requestChanges) args += ' --request-changes';
  else if (comment) args += ' --comment';
  
  if (body) args += ` --body "${body.replace(/"/g, '\\"')}"`;
  
  try {
    const result = gh(args);
    console.log('\n리뷰 완료');
    if (result) console.log(result);
  } catch (error) {
    console.error('리뷰 실패:', error.message);
    process.exit(1);
  }
}

/**
 * 도움말
 */
function showHelp() {
  console.log(`
Git CLI - 토큰 최적화된 Git/GitHub 작업 도구

사용법:
  node scripts/git-cli.cjs <command> [options]

기본 명령어:
  status
    변경 상태를 요약합니다.
    예: node scripts/git-cli.cjs status

  diff [options]
    변경사항을 요약합니다.
    옵션:
      --staged       스테이징된 변경사항만
      --file=<path>  특정 파일만
      --detail       상세 diff 포함
    예: node scripts/git-cli.cjs diff --staged

  log [options]
    커밋 히스토리를 조회합니다.
    옵션:
      --max=<n>         최대 커밋 수 (기본: 20)
      --author=<name>   작성자 필터
      --since=<date>    시작 날짜
      --until=<date>    종료 날짜
    예: node scripts/git-cli.cjs log --max=10

  commit [options]
    커밋을 생성합니다.
    옵션:
      --message=<msg>  커밋 메시지 (없으면 제안)
      -a, --all        모든 변경사항 자동 스테이징
    예: node scripts/git-cli.cjs commit --message="feat(ui): add button"

  push [options]
    원격에 푸시합니다.
    옵션:
      --force, -f         강제 푸시
      -u, --set-upstream  업스트림 설정
      --remote=<name>     원격 이름 (기본: origin)
      --branch=<name>     브랜치 이름
    예: node scripts/git-cli.cjs push -u

GitHub PR 명령어 (gh CLI 필요):
  pr-create [options]
    PR을 생성합니다.
    옵션:
      --title=<title>  PR 제목 (필수)
      --body=<body>    PR 설명
      --base=<branch>  대상 브랜치 (기본: main)
      --draft          드래프트로 생성
    예: node scripts/git-cli.cjs pr-create --title="feat: new feature"

  pr-list [options]
    PR 목록을 조회합니다.
    옵션:
      --state=<state>  상태 (open, closed, merged, all) (기본: open)
      --max=<n>        최대 개수 (기본: 20)
    예: node scripts/git-cli.cjs pr-list --state=all

  pr-view <number>
    PR 상세 정보를 조회합니다.
    예: node scripts/git-cli.cjs pr-view 123

  pr-merge <number> [options]
    PR을 머지합니다.
    옵션:
      --method=<m>      머지 방법 (merge, squash, rebase) (기본: merge)
      --delete-branch   머지 후 브랜치 삭제
    예: node scripts/git-cli.cjs pr-merge 123 --method=squash

  pr-review <number> [options]
    PR을 리뷰합니다.
    옵션:
      --approve          승인
      --request-changes  변경 요청
      --comment          코멘트만
      --body=<text>      리뷰 메시지
    예: node scripts/git-cli.cjs pr-review 123 --approve

  help
    이 도움말을 표시합니다.

gh CLI 설치:
  winget install GitHub.cli
  gh auth login
`);
}

// --- Argument Parser ---
function parseArgs(args) {
  const result = { _: [] };
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      result[key] = valueParts.length > 0 ? valueParts.join('=') : true;
    } else if (arg.startsWith('-') && arg.length === 2) {
      result[arg.slice(1)] = true;
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
  
  try {
    switch (command) {
      case 'status':
        gitStatus();
        break;
      
      case 'diff':
        gitDiff(args);
        break;
      
      case 'log':
        gitLog(args);
        break;
      
      case 'commit':
        gitCommit(args);
        break;
      
      case 'push':
        gitPush(args);
        break;
      
      case 'pr-create':
        prCreate(args);
        break;
      
      case 'pr-list':
        prList(args);
        break;
      
      case 'pr-view':
        prView(args._[1]);
        break;
      
      case 'pr-merge':
        prMerge(args._[1], args);
        break;
      
      case 'pr-review':
        prReview(args._[1], args);
        break;
      
      default:
        console.error(`알 수 없는 명령어: ${command}`);
        console.error('도움말: node scripts/git-cli.cjs help');
        process.exit(1);
    }
  } catch (error) {
    console.error(`\n오류 발생: ${error.message}`);
    process.exit(1);
  }
}

main();

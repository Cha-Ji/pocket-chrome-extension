/**
 * 테스트 프로파일 셋업 스크립트
 * =============================
 *
 * Playwright용 Chrome 프로파일을 생성합니다.
 * 브라우저가 열리면 PO 계정(기본: real URL)에 로그인하세요.
 * 로그인 완료 후 콘솔에서 Enter를 누르면 프로파일이 저장됩니다.
 *
 * 사용법: npx tsx scripts/setup-test-profile.ts
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ROOT = path.resolve(__dirname, '..')
const PROFILE_DIR = path.join(PROJECT_ROOT, 'test-profile')
const EXTENSION_PATH = path.join(PROJECT_ROOT, 'dist')

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

async function main() {
  // dist 존재 확인
  if (!fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    console.error('빌드가 필요합니다: npm run build')
    process.exit(1)
  }

  // 기존 프로파일 확인
  if (fs.existsSync(PROFILE_DIR)) {
    console.log(`기존 프로파일 발견: ${PROFILE_DIR}`)
    await waitForEnter('덮어쓰시겠습니까? (Enter=계속 / Ctrl+C=취소) ')
  }

  console.log('브라우저를 실행합니다...')
  console.log(`프로파일 경로: ${PROFILE_DIR}`)
  console.log('')

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })

  const page = context.pages()[0] || await context.newPage()
  const poUrl = process.env.PO_URL || 'https://pocketoption.com/en/cabinet/quick-high-low/'
  await page.goto(poUrl)

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(`  브라우저에서 PO 계정에 로그인하세요. (${poUrl})`)
  console.log('  로그인 후 거래 화면이 보이면 Enter를 누르세요.')
  console.log('════════════════════════════════════════════════')
  console.log('')

  await waitForEnter('로그인 완료 → Enter: ')

  // 세션 확인: 쿠키 체크
  const cookies = await context.cookies('https://pocketoption.com')
  const hasSession = cookies.some(c => c.name.includes('session') || c.name.includes('token') || c.name.includes('auth'))

  if (hasSession) {
    console.log(`세션 쿠키 확인됨 (${cookies.length}개 쿠키 저장)`)
  } else {
    console.log(`경고: 세션 쿠키를 명시적으로 찾지 못했지만, 프로파일은 저장됩니다.`)
    console.log(`저장된 쿠키: ${cookies.map(c => c.name).join(', ')}`)
  }

  await context.close()

  console.log('')
  console.log('프로파일 저장 완료!')
  console.log(`경로: ${PROFILE_DIR}`)
  console.log('')
  console.log('사용법:')
  console.log('  TEST_PROFILE=./test-profile npm run test:e2e:cdp')
}

main().catch((err) => {
  console.error('에러:', err)
  process.exit(1)
})

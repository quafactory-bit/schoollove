// Disposable browser fixture: real search/account components, mocked router/API, no remote services.
/* eslint-disable @typescript-eslint/no-require-imports -- Node-only harness uses Next's bundled CommonJS webpack and project config. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { chromium, expect } = require('@playwright/test')
const webpackModule = require('next/dist/compiled/webpack/webpack')
webpackModule.init()

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'discovery-history-ui-'))
  let browser, server
  try {
    await new Promise((resolve, reject) => {
      const compiler = webpackModule.webpack({ mode: 'development', devtool: false, entry: path.join(__dirname, 'ui-entry.tsx'),
        plugins: [new webpackModule.webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
        output: { path: temporary, filename: 'bundle.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@/lib/hooks/useSchoolAutocomplete': path.join(__dirname, 'autocomplete-shim.ts'), '@/lib/api/search': path.join(__dirname, '../class-history-self-service/search-shim.ts'), '@': process.cwd(), 'next/navigation': path.join(__dirname, 'navigation-shim.ts') } },
        module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, '../class-history-self-service/typescript-loader.cjs') }] },
      })
      compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()))
    })
    const css = await require('postcss')([require('tailwindcss')({ ...require('../../tailwind.config.ts').default,
      content: ['app/people/search/*.tsx', 'components/account/*.tsx', 'app/account/AccountClient.tsx', path.join(__dirname, 'ui-entry.tsx')],
    })]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })
    server = http.createServer(async (req, res) => {
      res.setHeader('content-type', (req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html') + '; charset=utf-8')
      res.end(req.url === '/bundle.js' ? await fs.readFile(path.join(temporary, 'bundle.js')) : req.url === '/style.css' ? css.css : '<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const [width, height] of [[360, 800], [390, 844], [412, 915], [1280, 900]]) {
      const page = await browser.newPage({ viewport: { width, height } })
      const errors = [], payloads = [], greetings = [], remote = []
      let answer = 'match', heldRoute
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', async route => {
        const request = route.request()
        if (!request.url().startsWith(origin + '/')) { remote.push(new URL(request.url()).origin); return route.abort() }
        if (request.url().endsWith('/api/connections/search')) {
          payloads.push(request.postDataJSON())
          if (answer === 'hold') { heldRoute = route; return }
          return route.fulfill({ status: answer === 'error' ? 503 : 200, json: answer === 'match' ? { state: 'match_available', matchToken: 'opaque-fixture-token' } : { state: 'unavailable' } })
        }
        if (request.url().endsWith('/api/connections/requests')) {
          greetings.push(request.postDataJSON())
          return route.fulfill({ status: 200, json: {} })
        }
        // Any unexpected API call is forbidden, including writes from account controls.
        if (request.url().includes('/api/')) { errors.push('unexpected local API request'); return route.abort() }
        return route.continue()
      })
      const submit = page.getByRole('button', { name: '정확히 일치하는지 확인', exact: true })
      const historyMode = page.getByRole('radio', { name: '내 학교 이력에서 찾기', exact: true })
      const manualMode = page.getByRole('radio', { name: '직접 입력해서 찾기', exact: true })
      const name = page.getByLabel('정확한 이름', { exact: true })
      const choices = () => page.getByRole('group', { name: '내 학교 이력 선택', exact: true }).getByRole('radio')
      const greeting = page.getByRole('heading', { name: '안부 보내기', exact: true })
      async function layout() {
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => {
          const box = node.getBoundingClientRect()
          return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1 || node.scrollWidth > node.clientWidth + 1)
        }).map(node => ({ tag: node.tagName, className: node.className, text: node.textContent?.slice(0, 70) })))
        if (overflow.length) {
          console.log('LOCAL_FIXTURE_OVERFLOW', JSON.stringify(overflow))
          if (process.argv[2]) await page.screenshot({ path: path.join(process.argv[2], 'discovery-overflow.png'), fullPage: true })
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        expect(await page.evaluate(() => [...document.querySelectorAll('input,button,textarea,select,a')].filter(node => {
          const box = node.getBoundingClientRect()
          return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1)
        }).length)).toBe(0)
      }
      async function searchMatch() {
        answer = 'match'
        await submit.click()
        await expect(greeting).toBeVisible()
      }
      async function manualSetup() {
        await manualMode.check()
        await page.getByLabel('학교', { exact: true }).fill('합성')
        await page.getByRole('button', { name: '합성고등학교 · 합성시 합성구', exact: true }).click()
        await page.getByLabel('졸업연도', { exact: true }).fill('2016')
        await name.fill('합성대상')
      }
      await page.goto(origin)
      await expect(choices()).toHaveCount(3)
      await expect(historyMode).toBeChecked()
      await expect(submit).toBeDisabled()
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)
      await name.fill('합성대상')
      for (let index = 0; index < 5; index++) {
        await choices().nth(index % 3).check()
        await manualMode.check()
        await historyMode.check()
      }
      await choices().nth(0).focus()
      await page.keyboard.press('ArrowDown')
      await expect(choices().nth(1)).toBeChecked()
      await choices().nth(2).check()
      await name.focus()
      await name.hover()
      expect(payloads).toHaveLength(0)
      await layout()
      if (width === 390 && process.argv[2]) await page.screenshot({ path: path.join(process.argv[2], 'discovery-history-390.png'), fullPage: true })
      await searchMatch()
      expect(payloads).toEqual([{ search_mode: 'same_class', school_id: '00000000-0000-4000-8000-000000000001', graduation_year: 2016, grade_number: 3, class_number: 1, exact_name: '합성대상' }])
      await expect(page.getByLabel('관계 유형')).toHaveValue('same_class')
      await page.getByLabel('최초 안부').fill('합성 안부입니다.')
      await page.getByRole('button', { name: '안부 미리보기', exact: true }).click()
      await expect(page.getByText('전송 전 미리보기 · 전송 후 수정 불가')).toBeVisible()
      await name.fill('새합성대상')
      await expect(greeting).toHaveCount(0)
      await expect(page.getByText('전송 전 미리보기 · 전송 후 수정 불가')).toHaveCount(0)
      await expect(page.getByRole('status')).toHaveCount(0)
      expect(payloads).toHaveLength(1)
      await searchMatch()
      await choices().nth(0).check()
      await expect(greeting).toHaveCount(0)
      await searchMatch()
      await manualMode.check()
      await expect(greeting).toHaveCount(0)
      // A late success cannot restore a token for superseded history/name criteria.
      await historyMode.check()
      answer = 'hold'
      await submit.click()
      await expect.poll(() => Boolean(heldRoute)).toBe(true)
      await name.fill('늦은응답무효')
      await heldRoute.fulfill({ status: 200, json: { state: 'match_available', matchToken: 'stale-token' } })
      heldRoute = undefined
      await expect(submit).toBeEnabled()
      await expect(greeting).toHaveCount(0)
      await expect(page.getByRole('status')).toHaveCount(0)
      const beforeUnavailable = payloads.length
      answer = 'unavailable'
      await submit.click()
      await expect(page.getByRole('status')).toHaveText('일치 여부를 확인하지 못했습니다.')
      await expect(greeting).toHaveCount(0)
      expect(payloads).toHaveLength(beforeUnavailable + 1)
      // Remount variants: empty and failed history preserve manual entry, single auto-selects.
      for (const [count, state] of [[0, 'ok'], [0, 'unavailable'], [1, 'ok']]) {
        const before = payloads.length
        await page.evaluate(args => window.historyFixture(...args), [count, state])
        await expect(count === 1 ? historyMode : manualMode).toBeChecked()
        if (count === 1) { await expect(choices()).toHaveCount(1); await expect(choices().first()).toBeChecked() }
        else {
          await expect(page.getByLabel('학교', { exact: true })).toBeVisible()
          if (state === 'ok') await expect(page.getByRole('link', { name: '학년·반 추가하기' })).toHaveAttribute('href', '/account')
          else await expect(page.getByText('내 학교 이력을 불러오지 못했습니다. 직접 입력해서 찾을 수 있습니다.')).toBeVisible()
        }
        await layout()
        expect(payloads).toHaveLength(before)
      }
      await manualSetup()
      await searchMatch()
      expect(payloads.at(-1)).toEqual({ school_id: '00000000-0000-4000-8000-000000000001', graduation_year: 2016, exact_name: '합성대상' })
      await expect(page.getByLabel('관계 유형')).toHaveValue('same_school')
      await page.getByLabel('졸업연도', { exact: true }).fill('2015')
      await expect(greeting).toHaveCount(0)
      await page.getByLabel('졸업연도', { exact: true }).fill('2016')
      await searchMatch()
      await page.getByRole('checkbox', { name: '같은 반까지 기억나요' }).check()
      await expect(greeting).toHaveCount(0)
      await page.getByLabel('학년', { exact: true }).fill('3')
      await page.getByLabel('반', { exact: true }).fill('1')
      await searchMatch()
      expect(payloads.at(-1)).toEqual({ search_mode: 'same_class', school_id: '00000000-0000-4000-8000-000000000001', graduation_year: 2016, grade_number: 3, class_number: 1, exact_name: '합성대상' })
      for (const [label, value] of [['학년', '2'], ['반', '2']]) {
        await page.getByLabel(label, { exact: true }).fill(value)
        await expect(greeting).toHaveCount(0)
        await searchMatch()
      }
      await page.getByLabel('학교', { exact: true }).fill('다른학교')
      await expect(greeting).toHaveCount(0)
      await page.getByRole('button', { name: '합성고등학교 · 합성시 합성구', exact: true }).click()
      await searchMatch()
      // Greeting payload remains the pre-existing exact three-field contract.
      await page.getByLabel('최초 안부').fill('합성 안부입니다.')
      await page.getByRole('button', { name: '안부 미리보기', exact: true }).click()
      await page.getByRole('button', { name: '이 안부를 한 번 보내기', exact: true }).click()
      await expect.poll(() => greetings.length).toBe(1)
      expect(greetings[0]).toEqual({ match_token: 'opaque-fixture-token', relationship_type: 'same_school', message: '합성 안부입니다.' })
      // Account CTA is independent of profile editing. No controls are submitted.
      const beforeAccount = payloads.length
      await page.evaluate(() => window.accountHistoryFixture(true, true))
      const link = page.getByRole('link', { name: '저장한 반에서 사람 찾기', exact: true })
      await expect(link).toHaveAttribute('href', '/people/search')
      await expect(page.getByRole('button', { name: '학년·반 수정', exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: '내 프로필 수정 저장', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '학교 이력 추가', exact: true })).toBeDisabled()
      await expect(page.getByRole('link', { name: '학교 페이지 보기', exact: true })).toHaveAttribute('href', '/school/synthetic-school')
      await expect(page.getByRole('button', { name: '학교 링크 공유', exact: true })).toBeVisible()
      await link.focus()
      await link.hover()
      await layout()
      if (width === 390 && process.argv[2]) await page.screenshot({ path: path.join(process.argv[2], 'discovery-account-390.png'), fullPage: true })
      await page.getByRole('button', { name: '학년·반 수정', exact: true }).click()
      await layout()
      await page.getByRole('button', { name: '취소', exact: true }).click()
      for (const args of [[false,true,'high',false,false],[true,false,'high',false,false],[true,true,'university',false,false],[true,true,'high',true,false],[true,true,'high',false,true]]) {
        await page.evaluate(args => window.accountHistoryFixture(...args), args)
        await expect(link).toHaveCount(0)
      }
      expect(payloads).toHaveLength(beforeAccount)
      expect(new URL(page.url()).pathname).toBe('/')
      expect(new URL(page.url()).search + new URL(page.url()).hash).toBe('')
      expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
      expect(remote).toEqual([])
      expect(errors).toEqual([])
      console.log('DISCOVERY_HISTORY_UI_PASS', JSON.stringify({ width, height, realComponents: true, variants: 'multiple/single/empty/unavailable', manual: 'exact/same-class', invalidation: 'all-criteria/late-response/preview', account: 'access/history/K12/deletion/emergency', overflow: 0, remoteRequests: 0, storage: 0 }))
      await page.close()
    }
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

// Disposable browser fixture: real editor component, mocked router/API, no remote services.
/* eslint-disable @typescript-eslint/no-require-imports -- Node-only harness uses Next's bundled CommonJS webpack and project config. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { chromium, expect } = require('@playwright/test')
const webpackModule = require('next/dist/compiled/webpack/webpack')
webpackModule.init()

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'class-history-ui-'))
  let browser, server
  try {
    await new Promise((resolve, reject) => {
      const compiler = webpackModule.webpack({ mode: 'development', devtool: false, entry: path.join(__dirname, 'ui-entry.tsx'),
        output: { path: temporary, filename: 'bundle.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': process.cwd(), 'next/navigation': path.join(__dirname, 'navigation-shim.ts') } },
        module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'typescript-loader.cjs') }] },
      })
      compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()))
    })
    const css = await require('postcss')([require('tailwindcss')({ ...require('../../tailwind.config.ts').default,
      content: [path.join(process.cwd(), 'components/account/ClassHistoryEditor.tsx'), path.join(__dirname, 'ui-entry.tsx')],
    })]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })
    server = http.createServer(async (req, res) => {
      res.setHeader('content-type', (req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html') + '; charset=utf-8')
      res.end(req.url === '/bundle.js' ? await fs.readFile(path.join(temporary, 'bundle.js')) : req.url === '/style.css' ? css.css : '<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const width of [360, 390, 412]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      page.on('pageerror', error => console.error('LOCAL_FIXTURE_ERROR', error.message))
      const payloads = []
      await page.route('**/*', async route => {
        if (!route.request().url().startsWith(origin)) return route.abort()
        if (route.request().url().includes('/api/account/memberships/')) {
          const body = route.request().postDataJSON()
          payloads.push(body)
          await page.evaluate(rows => { window.savedRows = rows }, body.grade_classes)
          return route.fulfill({ status: 200, json: { classHistory: body.grade_classes } })
        }
        return route.continue()
      })
      await page.goto(origin)
      await page.getByRole('button', { name: '학년·반 추가', exact: true }).click()
      await expect(page.getByRole('spinbutton')).toHaveCount(3)
      await page.getByRole('spinbutton', { name: '1학년 반' }).fill('4')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(page.getByTestId('history')).toHaveText('1학년 4반')
      expect(payloads).toEqual([{ grade_classes: [{ grade_number: 1, class_number: 4 }] }])
      await page.getByRole('button', { name: '학년·반 수정', exact: true }).click()
      await expect(page.getByRole('spinbutton', { name: '1학년 반' })).toHaveValue('4')
      await page.getByRole('spinbutton', { name: '1학년 반' }).fill('')
      await page.getByRole('button', { name: '취소', exact: true }).click()
      await expect(page.getByTestId('history')).toHaveText('1학년 4반')
      expect(payloads).toHaveLength(1)
      await page.getByRole('button', { name: '학년·반 수정', exact: true }).click()
      await page.getByRole('spinbutton', { name: '1학년 반' }).fill('')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(page.getByRole('button', { name: '학년·반 추가', exact: true })).toBeVisible()
      expect(payloads[1]).toEqual({ grade_classes: [] })
      await page.evaluate(() => window.fixture('elementary', true, []))
      await page.getByRole('button', { name: '학년·반 추가', exact: true }).click()
      await expect(page.getByRole('spinbutton')).toHaveCount(6)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.evaluate(() => window.fixture('university', true, []))
      await expect(page.getByRole('button')).toHaveCount(0)
      await page.evaluate(() => window.fixture('high', false, []))
      await expect(page.getByRole('button')).toHaveCount(0)
      console.log(`UI_PASS width=${width} add/replace/preload/cancel/clear/nonK12/closed overflow=0`)
      await page.close()
    }
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

// Form test regression check (see weather-test-handover.md → Testing).
// Runs the Form test end to end in fast mode (local mode, fake mic) and saves
// screenshots, screen texts and the exported data to OUT_DIR.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:5173/'
const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['microphone'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const texts = []
const snap = async (name) => {
  texts.push(`== ${name}\n${await page.locator('body').innerText()}`)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const click = (name) => page.getByRole('button', { name, exact: true }).click()

await page.goto(BASE + '?fast=1&order=plant-orb&code=E2E')
await snap('01-start')
await page.getByRole('textbox').fill('my mum')
await click('Start')
await page.waitForTimeout(500)
await snap('02-calibrate')
await page.getByRole('button').first().click()
await page.getByRole('button', { name: /^Continue/ }).waitFor({ timeout: 30000 })
await snap('03-calibrated')
await page.getByRole('button', { name: /^Continue/ }).click()

for (const round of [1, 2]) {
  await snap(`1${round}-between`)
  await click('Begin')
  await page.waitForTimeout(12000)
  await snap(`1${round}-round-mid`)
  await page.getByRole('button', { name: 'Continue to questions' }).waitFor({ timeout: 40000 })
  await snap(`1${round}-round-done`)
  await click('Continue to questions')
  await snap(`1${round}-survey`)
  for (const group of await page.getByRole('radiogroup').all()) await group.getByRole('radio').nth(3).click()
  await click('Continue')
}
await snap('20-final')
await page.getByRole('radio').first().click()
for (const t of await page.getByRole('textbox').all()) await t.fill('because')
await click('Finish')
await page.waitForTimeout(300)
await snap('21-done')
const [dl] = await Promise.all([page.waitForEvent('download'), click('Download data')])
await dl.saveAs(path.join(OUT, 'data.json'))

await page.goto(BASE + '?compare=1')
await page.waitForTimeout(2000)
await snap('30-compare')

fs.writeFileSync(path.join(OUT, 'texts.txt'), texts.join('\n\n'))
fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'))
await browser.close()
console.log('done', errors.length, 'errors')

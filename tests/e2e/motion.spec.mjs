import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const previews = 'E:/四六级真题/work/app-previews'
const practice = section => `/#/pages/practice/index?paper=CET4-2025-12-1&section=${section}`
const settle = async page => expect(page.locator('.motion-overlay')).toHaveCount(0)
const matrix = locator => locator.evaluate(el => {
  const value = getComputedStyle(el).transform
  const m = new DOMMatrixReadOnly(value === 'none' ? undefined : value)
  return { x: m.m41, y: m.m42, scale: m.m11 }
})

test.beforeEach(async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.__motionErrors = errors
})
test.afterEach(async ({ page }) => { expect(page.__motionErrors).toEqual([]) })

test('Motion press feedback and rapidly interrupted shared segment layouts', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.startup-motion')).toHaveCount(0)
  const card = page.locator('.paper-row').first(), box = await card.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect.poll(async () => (await matrix(card)).scale).toBeLessThan(0.99)
  await page.mouse.move(2, 2); await page.mouse.up()
  await expect.poll(async () => (await matrix(card)).scale).toBeGreaterThan(0.999)
  await page.locator('.level-switch').evaluate(el => {
    for (let n = 0; n < 11; n++) el.querySelectorAll('button')[n % 2].click()
    el.querySelectorAll('button')[1].click()
  })
  await expect(page.locator('.level-button.active')).toContainText('六级')
  await expect(page.locator('.segment-indicator')).toHaveCount(1)
  await expect.poll(async () => {
    const a = await page.locator('.segment-indicator').boundingBox(), b = await page.locator('.level-button.active').boundingBox()
    return Math.abs(a.x - b.x)
  }).toBeLessThan(0.5)
  await page.locator('.year-chip').filter({ hasText: '2025' }).click()
  await expect(page.locator('.year-indicator')).toHaveCount(1)
  await expect(page.locator('.session-heading').first()).toContainText('2025')
})

test('paper expands across navigation and returns to its list position', async ({ page }, info) => {
  await page.goto('/')
  await page.locator('.year-chip').filter({ hasText: '2025' }).click()
  await page.locator('.paper-row').first().click()
  await expect(page.locator('.section-row')).toHaveCount(6)
  await page.locator('.section-row').filter({ hasText: '仔细阅读' }).click()
  await expect(page.locator('.journey-page')).toBeVisible()
  // A non-identity transform is evidence of Motion's shared layout projection.
  await expect.poll(async () => (await matrix(page.locator('.journey-page'))).scale).toBeLessThan(0.99)
  await page.screenshot({ path: `${previews}/${info.project.name}-route-in-motion.png` })
  await expect(page.locator('.practice-title')).toHaveText('仔细阅读')
  await expect(page.locator('.paper-journey')).toHaveCount(0)
  await page.locator('.back-button').click()
  await expect(page.locator('.journey-card')).toBeVisible()
  await expect(page.locator('.paper-journey')).toHaveCount(0)
  await expect(page.locator('.year-chip.selected')).toHaveText('2025')
  await expect(page.locator('.resume-card')).toBeVisible()
})

test('anchored word menu stays inside the viewport and preserves inline answers', async ({ page }, info) => {
  await page.goto(practice('cloze'))
  const blank = page.locator('.cloze-blank').last()
  await blank.scrollIntoViewIfNeeded(); await blank.locator('.blank-label').click()
  const menu = page.locator('.word-picker')
  await expect(menu).toBeVisible()
  await expect.poll(async () => (await matrix(menu)).scale).toBeGreaterThan(0.999)
  const box = await menu.boundingBox(), viewport = page.viewportSize()
  expect(box.x).toBeGreaterThanOrEqual(10); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 10)
  expect(box.y).toBeGreaterThanOrEqual(10); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 10)
  const label = await menu.locator('.option').last().locator('.option-label').innerText()
  await menu.locator('.option').last().locator('.option-label').click()
  await settle(page)
  await expect(blank).toContainText(`${label})`)
  await expect(page.locator('.answered-count')).toHaveText('已答 1')
  await expect.poll(async () => (await matrix(page.locator('.progress-fill'))).scale).toBeGreaterThan(0.099)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await blank.locator('.blank-label').click(); await expect(menu).toBeVisible()
  await page.keyboard.press('Escape'); await settle(page)
  await expect(blank).toBeFocused()
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThan(2)
  await page.screenshot({ path: `${previews}/${info.project.name}-mint-cloze.png`, fullPage: true })
  await page.reload(); await expect(page.locator('.cloze-blank').last()).toContainText(`${label})`)
})

async function dragHeader(page, distance, pauseBeforeRelease = 0) {
  await page.locator('.sheet-drag-zone').click({ trial: true })
  const box = await page.locator('.sheet-drag-zone').boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y + distance, { steps: 18 })
  const displacement = (await matrix(page.locator('.motion-sheet'))).y
  if (pauseBeforeRelease) await page.waitForTimeout(pauseBeforeRelease)
  await page.mouse.up()
  return displacement
}

test('bottom sheet follows the pointer, snaps back, scrolls and dismisses by distance or velocity', async ({ page }, info) => {
  await page.goto(practice('cloze'))
  await page.locator('.check-answers-button').click()
  await expect(page.locator('.results-sheet')).toBeVisible()
  await expect.poll(async () => Math.abs((await matrix(page.locator('.results-sheet'))).y)).toBeLessThan(0.5)
  expect(await dragHeader(page, 52, 200)).toBeGreaterThan(45)
  await expect.poll(async () => Math.abs((await matrix(page.locator('.results-sheet'))).y)).toBeLessThan(0.5)
  const scroller = page.locator('.results-sheet .sheet-content')
  await scroller.evaluate(el => { el.scrollTop = 180 })
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(150)
  expect(Math.abs((await matrix(page.locator('.results-sheet'))).y)).toBeLessThan(0.5)
  await scroller.evaluate(el => { el.scrollTop = 0 })
  const cdp = await page.context().newCDPSession(page), rect = await scroller.boundingBox()
  const touchX = rect.x + rect.width / 2, touchY = rect.y + Math.min(rect.height - 25, 240)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] })
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX, y: touchY - step * 12 }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(50)
  expect(Math.abs((await matrix(page.locator('.results-sheet'))).y)).toBeLessThan(0.5)
  await cdp.detach()
  await page.screenshot({ path: `${previews}/${info.project.name}-mint-sheet.png` })
  expect(await dragHeader(page, 180, 150)).toBeGreaterThan(150)
  await settle(page)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.locator('.font-button').click()
  await expect.poll(async () => (await matrix(page.locator('.motion-sheet'))).y).toBeLessThan(0.5)
  // A short, quick fling should also close, unlike the slow 52px drag above.
  const box = await page.locator('.sheet-drag-zone').boundingBox()
  await page.mouse.move(box.x + 80, box.y + 10); await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 28); await page.waitForTimeout(20)
  await page.mouse.move(box.x + 80, box.y + 100); await page.waitForTimeout(16); await page.mouse.up()
  await settle(page)
})

test('rapid directional question changes keep one group and the same audio player', async ({ page }) => {
  await page.goto(practice('listening'))
  await expect(page.locator('.listening-question')).toHaveCount(2)
  await page.locator('.listening-player').evaluate(el => { window.originalAudioPlayer = el })
  await page.locator('.next-button').click()
  await expect(page.locator('.position')).toHaveText('2 / 8组')
  await expect.poll(async () => Math.abs((await matrix(page.locator('.group-motion'))).x)).toBeGreaterThan(0.1)
  await page.locator('.next-button').evaluate(el => { for (let i = 0; i < 3; i++) el.click() })
  await expect(page.locator('.position')).toHaveText('5 / 8组')
  await expect(page.locator('.group-motion')).toHaveCount(1)
  await expect.poll(async () => Math.abs((await matrix(page.locator('.group-motion'))).x)).toBeLessThan(0.01)
  expect(await page.locator('.listening-player').evaluate(el => el === window.originalAudioPlayer)).toBe(true)
  await page.locator('.previous-button').click()
  await expect(page.locator('.position')).toHaveText('4 / 8组')
  await expect(page.locator('.group-motion')).toHaveCount(1)
  await expect.poll(async () => Math.abs((await matrix(page.locator('.group-motion'))).x)).toBeLessThan(0.01)
  await page.reload(); await expect(page.locator('.position')).toHaveText('4 / 8组')
})

test('reduced motion disables press and travel while retaining usable controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const card = page.locator('.paper-row').first(), box = await card.boundingBox()
  await page.mouse.move(box.x + 30, box.y + 20); await page.mouse.down(); await page.waitForTimeout(100)
  expect((await matrix(card)).scale).toBe(1)
  await page.mouse.move(1, 1); await page.mouse.up()
  await page.goto(practice('cloze'))
  await page.locator('.font-button').click()
  await expect(page.locator('.motion-sheet')).toBeVisible()
  expect((await matrix(page.locator('.motion-sheet'))).y).toBe(0)
  await page.locator('.font-choice').last().click()
  await page.keyboard.press('Escape'); await settle(page)
  await expect(page.locator('.font-button')).toBeFocused()
  expect(await page.locator('.practice').evaluate(el => el.style.getPropertyValue('--reading-size'))).toBe('21px')
  await page.goto('/')
  await page.goto(practice('reading'))
  await page.locator('.floating-answer-button').click()
  // Teleport must carry the selected reading size into the dialog as well.
  expect(await page.locator('.question-summary .question-stem').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('19px')
})

test('result summary excludes missing keys and never grades subjective drafts', async ({ page }) => {
  const data = JSON.parse(readFileSync(new URL('../../src/static/papers/CET4-2025-12-1.json', import.meta.url), 'utf8'))
  delete data.solutions.items['26']
  await page.route('**/static/papers/CET4-2025-12-1.json', route => route.fulfill({ json: data }))
  await page.goto(practice('cloze'))
  await page.locator('.check-answers-button').click()
  await expect(page.locator('.result-total')).toHaveText('0 / 9')
  await expect(page.locator('.result-missing-note')).toHaveText('答案缺失 1 题')
  await expect(page.locator('.results-sheet .result-missing')).toHaveCount(1)
  await page.locator('.mistake-toggle').click()
  await expect(page.locator('.results-sheet .result-list-entry')).toHaveCount(9)
  await page.locator('.close-button').click(); await settle(page)
  await page.goto('/')
  await page.goto(practice('writing'))
  await expect(page.locator('.startup-motion')).toHaveCount(0)
  await page.locator('textarea').fill('A draft for reference comparison only.')
  await page.locator('.check-answers-button').click()
  await expect(page.locator('.result-reference-heading')).toHaveText('自行对照')
  await expect(page.locator('.result-total')).toHaveCount(0)
  await expect(page.locator('.mistake-toggle')).toHaveCount(0)
  await page.locator('.close-button').click(); await settle(page)
  await expect(page.locator('textarea')).toHaveValue('A draft for reference comparison only.')
})

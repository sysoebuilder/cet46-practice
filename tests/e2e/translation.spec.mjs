import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function open(page) {
  await page.goto('/#/pages/practice/index?paper=CET4-2025-12-1&section=reading')
  await expect(page.locator('.material-scroll .reading-text').first()).toBeVisible()
  await expect(page.locator('.startup-screen')).toHaveCount(0)
}

async function point(page, index = 0) {
  return page.locator('.material-scroll .reading-text').first().evaluate((element, index) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode(), words = [...node.textContent.matchAll(/[A-Za-z]{3,}/g)]
    const match = words[index], range = document.createRange()
    range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length)
    const rect = range.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: match[0] }
  }, index)
}

// Explicit transport fixture. These tests prove UI/Promise behavior, not Foxlet inference.
async function fixture(page) {
  await page.addInitScript(() => {
    window.__foxletCalls = []
    window.__foxletReplies = []
    const native = {
      importClass: name => name, runtimeMainActivity: () => ({}), implements: (_, callback) => callback,
      invoke: (_, method, ...args) => {
        if (method === 'getInstance') return {}
        const callback = args.at(-1), id = args.at(-2)
        window.__foxletCalls.push({ method, text: args[0] })
        if (method === 'init' || method === 'destroy') setTimeout(() => callback.onSuccess(id, '{}'), 10)
        else window.__foxletReplies.push({ callback, id })
      },
    }
    window.plus = { os: { name: 'Android' }, android: native, navigator: { closeSplashscreen() {} } }
    window.__reply = (index, value) => { const reply = window.__foxletReplies[index]; reply.callback.onSuccess(reply.id, value) }
  })
}

test('tap shows honest unsupported state and does not alter the passage', async ({ page }) => {
  await open(page)
  const before = await page.locator('.material-scroll .reading-text').first().innerHTML()
  const word = await point(page)
  await page.touchscreen.tap(word.x, word.y)
  await expect(page.locator('.translation-card')).toBeVisible()
  await expect(page.locator('.translation-source')).toHaveText(word.text)
  await expect(page.locator('.translation-result')).toContainText('Android')
  const bounds = await page.locator('.translation-card').boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height)
  expect(word.y < bounds.y || word.y > bounds.y + bounds.height).toBe(true)
  await expect.poll(() => page.locator('.translation-card').evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.99)
  await page.screenshot({ path: `E:/四六级真题/work/foxlet/ui-${page.viewportSize().width}.png` })
  expect(await page.locator('.material-scroll .reading-text').first().innerHTML()).toBe(before)
  await page.locator('.translation-close').click()
  await expect(page.locator('.translation-card')).toBeHidden()
})

test('latest word wins, identical word uses cache and one init, blank tap closes', async ({ page }) => {
  await fixture(page); await open(page)
  const first = await point(page), second = await point(page, 1)
  await page.touchscreen.tap(first.x, first.y)
  await expect.poll(() => page.evaluate(() => window.__foxletReplies.length)).toBe(1)
  await page.touchscreen.tap(second.x, second.y)
  await expect.poll(() => page.evaluate(() => window.__foxletReplies.length)).toBe(2)
  await page.evaluate(() => window.__reply(1, '界面测试结果 B'))
  await expect(page.locator('.translation-result')).toHaveText('界面测试结果 B')
  await page.evaluate(() => window.__reply(0, '界面测试结果 A'))
  await expect(page.locator('.translation-result')).toHaveText('界面测试结果 B')
  await page.touchscreen.tap(first.x, first.y)
  await expect(page.locator('.translation-result')).toHaveText('界面测试结果 A')
  expect(await page.evaluate(() => window.__foxletCalls.filter(call => call.method === 'init').length)).toBe(1)
  expect(await page.evaluate(() => window.__foxletCalls.filter(call => call.method === 'translate').length)).toBe(2)
  await page.locator('.practice-title').click()
  await expect(page.locator('.translation-card')).toBeHidden()
})

test('actual DOM selection stays adjustable, whole sentence translates and copies', async ({ page, context }) => {
  await fixture(page); await open(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Actual native Range/Selection APIs; Android handle gestures still need a device.
  await page.locator('.material-scroll .reading-text').first().evaluate(element => {
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 12)
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await expect(page.locator('[data-action="sentence"]')).toBeVisible()
  await page.locator('[data-action="sentence"]').click()
  const selected = await page.evaluate(() => getSelection().toString())
  expect(selected.length).toBeGreaterThan(12)
  await page.locator('[data-action="translate"]').click()
  await expect.poll(() => page.evaluate(() => window.__foxletReplies.length)).toBe(1)
  expect(await page.evaluate(() => window.__foxletCalls.find(call => call.method === 'translate').text)).toBe(selected.trim())
  await page.evaluate(() => window.__reply(0, '选区界面测试'))
  await expect(page.locator('.translation-result')).toHaveText('选区界面测试')
  // Clipboard in this fixture uses browser fallback; Native.js ClipboardManager needs a device.
  await page.evaluate(() => { window.plus.android = undefined })
  await page.locator('[data-action="copy"]').click()
  await expect(page.locator('[data-action="copy"]')).toHaveText('已复制')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('选区界面测试')
  await page.locator('[data-action="reselect"]').click()
  await expect(page.locator('.translation-card')).toBeHidden()
})

test('long press does not infer a word and reduced motion is honored', async ({ page }) => {
  await fixture(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page)
  const word = await point(page)
  await page.mouse.move(word.x, word.y); await page.mouse.down(); await page.waitForTimeout(480); await page.mouse.up()
  expect(await page.evaluate(() => window.__foxletCalls.filter(call => call.method === 'translate').length)).toBe(0)
  await page.waitForTimeout(750)
  await page.evaluate(() => getSelection().removeAllRanges())
  await page.touchscreen.tap(word.x, word.y)
  await expect(page.locator('.translation-card')).toBeVisible()
  expect(await page.locator('.translation-card').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
})

async function exam(page, section) {
  await fixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/#/pages/practice/index?paper=CET4-2025-12-1&section=${section}`)
  await expect(page.locator('.startup-screen')).toHaveCount(0)
  await expect(page.locator('.check-answers-button')).toBeVisible()
}

async function copyPoint(locator) {
  await locator.scrollIntoViewIfNeeded()
  return locator.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node, match
    while ((node = walker.nextNode())) {
      match = /[A-Za-z]{3,}/.exec(node.textContent)
      if (match) break
    }
    if (!node) throw new Error('Expected English exam copy')
    const range = document.createRange()
    range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length)
    const rect = range.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: match[0] }
  })
}

async function translateCopy(page, locator) {
  const word = await copyPoint(locator)
  await page.touchscreen.tap(word.x, word.y)
  await expect(page.locator('.translation-source')).toHaveText(word.text)
  await expect(page.locator('.translation-card')).toBeVisible()
}

async function selectCopy(page, locator) {
  await locator.evaluate(element => {
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(node.length, 18))
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await expect(page.locator('.translation-card.is-selection')).toBeVisible()
  await page.locator('[data-action="translate"]').click()
  await expect(page.locator('.translation-result.is-loading')).toBeVisible()
}

for (const section of ['reading', 'matching']) {
  test(`${section} question text translates and selects without toggling the question`, async ({ page }) => {
    await exam(page, section)
    await page.locator('.floating-answer-button').click()
    const entry = page.locator('.question-entry').first()
    const stem = entry.locator('.question-stem')
    await translateCopy(page, stem)
    await expect(entry.locator('.question-dropdown')).toHaveCount(0)
    await page.locator('.translation-close').click()
    await selectCopy(page, stem)
    await expect(entry.locator('.question-dropdown')).toHaveCount(0)
    await page.locator('[data-action="reselect"]').click()
    await entry.locator('.question-number').click()
    await expect(entry.locator('.question-dropdown')).toBeVisible()
    if (section === 'reading') {
      await translateCopy(page, entry.locator('.option-text').first())
      await expect(page.locator('.answered-count')).toHaveText('已答 0')
      await page.locator('.translation-close').click()
    }
    await entry.locator('.option-label').first().click()
    await expect(page.locator('.answered-count')).toHaveText('已答 1')
    await expect(entry.locator('.chosen-answer')).toBeVisible()
  })
}

test('listening option words and selection translate without choosing, letters still choose', async ({ page }) => {
  await exam(page, 'listening')
  const option = page.locator('.listening-question .option').first()
  await translateCopy(page, option.locator('.option-text'))
  await expect(option).not.toHaveClass(/chosen/)
  await page.locator('.translation-close').click()
  await selectCopy(page, option.locator('.option-text'))
  await expect(option).not.toHaveClass(/chosen/)
  await page.locator('[data-action="reselect"]').click()
  await option.locator('.option-label').click()
  await expect(option).toHaveClass(/chosen/)
  await translateCopy(page, page.locator('.lead-in').first())
})

test('cloze word bank and filled word translate while the letter opens and fills the blank', async ({ page }) => {
  await exam(page, 'cloze')
  const blank = page.locator('.cloze-blank').first()
  await blank.locator('.blank-label').click()
  const option = page.locator('.word-picker .option').first()
  await translateCopy(page, option.locator('.option-text'))
  await expect(blank).not.toHaveClass(/filled/)
  await page.locator('.translation-close').click()
  await selectCopy(page, option.locator('.option-text'))
  await page.locator('[data-action="reselect"]').click()
  await option.locator('.option-label').click()
  await expect(blank).toHaveClass(/filled/)
  await expect(page.locator('.word-picker')).toHaveCount(0)
  await translateCopy(page, blank.locator('.blank-translation'))
  await expect(page.locator('.word-picker')).toHaveCount(0)
  await page.locator('.translation-close').click()
  await blank.locator('.blank-label').click()
  await expect(page.locator('.word-picker')).toBeVisible()
})

for (const section of ['writing', 'translation']) {
  test(`${section} directions translate while answer input retains editing`, async ({ page }) => {
    await exam(page, section)
    await page.locator('.directions-toggle').click()
    await translateCopy(page, page.locator('.directions'))
    await page.locator('.translation-close').click()
    await selectCopy(page, page.locator('.directions'))
    await page.locator('[data-action="reselect"]').click()
    await page.locator('textarea').fill('My answer stays editable.')
    await expect(page.locator('textarea')).toHaveValue('My answer stays editable.')
    await expect(page.locator('.translation-card')).toBeHidden()
  })
}

test('English in bilingual translation passages and reference answers is selectable and translatable', async ({ page }) => {
  const paper = JSON.parse(readFileSync(new URL('../../src/static/papers/CET4-2025-12-1.json', import.meta.url), 'utf8'))
  paper.Translation.tasks[0].source_text = '中文中的 English text remains available.'
  paper.solutions.references.writing = [{ kind: 'writing', title: '参考答案', text: 'A reference composition for this interface test.' }]
  await page.route('**/static/papers/CET4-2025-12-1.json', route => route.fulfill({ json: paper }))
  await exam(page, 'translation')
  await translateCopy(page, page.locator('.chinese-text'))
  await page.locator('.translation-close').click()
  await selectCopy(page, page.locator('.chinese-text'))
  await page.locator('[data-action="reselect"]').click()
  await exam(page, 'writing')
  await page.locator('.check-answers-button').click()
  await page.locator('.results-sheet .close-button').click()
  await expect(page.locator('.motion-overlay')).toHaveCount(0)
  await page.locator('.result-answer').click()
  await translateCopy(page, page.locator('.review-body'))
  await page.locator('.translation-close').click()
  await selectCopy(page, page.locator('.review-body'))
})

test('cloze correction words translate and the Chinese answer label still opens explanations', async ({ page }) => {
  await exam(page, 'cloze')
  await page.locator('.check-answers-button').click()
  await page.locator('.results-sheet .close-button').click()
  await expect(page.locator('.motion-overlay')).toHaveCount(0)
  const correction = page.locator('.cloze-correction').first()
  const english = correction.locator('span').last()
  await translateCopy(page, english)
  await expect(page.locator('.explanation-sheet')).toHaveCount(0)
  await page.locator('.translation-close').click()
  await selectCopy(page, english)
  await page.locator('[data-action="reselect"]').click()
  await correction.locator('.correction-label').click()
  await expect(page.locator('.explanation-sheet')).toBeVisible()
})

test('long translation can be touch scrolled to its end without closing the card or moving the article', async ({ page }) => {
  await fixture(page); await open(page)
  const word = await point(page)
  await page.touchscreen.tap(word.x, word.y)
  await expect.poll(() => page.evaluate(() => window.__foxletReplies.length)).toBe(1)
  await page.evaluate(() => window.__reply(0, '这是专门用于界面滚动测试的长文本。'.repeat(180) + '滚动验证末尾'))
  const content = page.locator('.translation-content')
  await expect.poll(() => content.evaluate(el => el.scrollHeight > el.clientHeight + 100)).toBe(true)
  const initialScroll = await page.evaluate(() => scrollY)
  const box = await content.boundingBox(), cdp = await page.context().newCDPSession(page)
  const x = box.x + box.width / 2, start = box.y + box.height * .8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] })
  for (let index = 1; index <= 8; index++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - box.height * .65 * index / 8 }] })
    await page.waitForTimeout(30)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(10)
  await expect(page.locator('.translation-card')).toBeVisible()
  expect(await page.evaluate(() => scrollY)).toBe(initialScroll)
  await content.evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect.poll(() => content.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2)
  const lastLineVisible = await page.locator('.translation-result').evaluate(el => {
    const range = document.createRange(), node = el.firstChild
    range.setStart(node, node.length - 6); range.setEnd(node, node.length)
    return range.getBoundingClientRect().bottom <= el.parentElement.getBoundingClientRect().bottom + 1
  })
  expect(lastLineVisible).toBe(true)
  await expect(page.locator('[data-action="copy"]')).toBeInViewport()
  await page.screenshot({ path: `E:/四六级真题/work/foxlet/long-result-${page.viewportSize().width}.png` })
  await page.locator('.translation-close').click()
  await expect(page.locator('.translation-card')).toBeHidden()
})

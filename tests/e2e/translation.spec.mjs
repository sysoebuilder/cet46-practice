import { test, expect } from '@playwright/test'

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

import { test, expect } from '@playwright/test'
const preview = 'E:/四六级真题/work/app-previews'
const entryPattern = /\/(?:assets\/index-[^/]+\.js|src\/main\.js)(?:\?|$)/

test('branded fallback hands off to real Motion frames and then the interactive home', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(entryPattern, async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue() })
  const navigation = page.goto('/')
  await expect(page.locator('#cet-boot-cover')).toBeVisible()
  await expect(page.locator('#cet-boot-cover .startup-title')).toHaveText('给我过')
  await expect.poll(() => page.locator('#cet-boot-cover img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await page.screenshot({ path: `${preview}/${info.project.name}-startup-fallback.png` })
  await navigation
  const overlay = page.locator('.startup-motion')
  await expect(overlay).toBeVisible()
  await expect.poll(() => overlay.locator('.startup-icon').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m11)).toBeLessThan(0.999)
  await page.screenshot({ path: `${preview}/${info.project.name}-startup-motion.png` })
  await expect.poll(() => overlay.evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(0.99)
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('#cet-boot-cover')).toHaveCount(0)
  expect(await page.evaluate(() => window.__CET_STARTUP_DONE__)).toBe(true)
  expect(await page.locator('.home-inner').evaluate(element => Boolean(element.closest('[inert]')))).toBe(false)
  await expect(page.locator('.brand-name')).toHaveText('给我过')
  await page.locator('.paper-row').first().click()
  await expect(page.locator('.section-row')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('reduced motion removes startup travel and promptly releases controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.addEventListener('cet:ui-mounted', () => { window.__startupMounted = performance.now() })
    window.addEventListener('cet:ready', () => { window.__startupDuration = performance.now() - window.__startupMounted })
  })
  await page.goto('/')
  await expect(page.locator('.startup-motion')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__startupDuration)).toBeLessThan(400)
  await page.locator('.level-button').last().click()
  await expect(page.locator('.level-button.active')).toContainText('六级')
})

test('a missing entry shows a usable retry state instead of a blank screen', async ({ page }, info) => {
  await page.route(entryPattern, route => route.abort())
  await page.goto('/')
  const failure = page.locator('#cet-boot-cover[data-error]')
  await expect(failure).toBeVisible()
  await expect(failure).toContainText('暂时无法打开')
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
  await page.screenshot({ path: `${preview}/${info.project.name}-startup-error.png` })
  await page.unroute(entryPattern)
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(failure).toHaveCount(0)
  await expect(page.locator('.home-inner')).toBeVisible()
})

test('slow paper reads have visible skeleton feedback and preserve navigation', async ({ page }) => {
  await page.route('**/static/papers/*.json', async route => { await new Promise(resolve => setTimeout(resolve, 900)); await route.continue() })
  await page.goto('/')
  await expect(page.locator('.startup-motion')).toHaveCount(0)
  await page.locator('.paper-row').first().click()
  await expect(page.locator('.loading-sections')).toBeVisible()
  await expect(page.locator('.section-row')).toHaveCount(6)
  await page.locator('.section-row').filter({ hasText: '选词填空' }).click()
  await expect(page.locator('.loading-paper')).toBeVisible()
  await expect(page.locator('.cloze-blank')).toHaveCount(10)
  await expect(page.locator('.loading-state')).toHaveCount(0)
})

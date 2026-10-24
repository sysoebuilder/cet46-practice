import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { projectRoot } from './project-paths.mjs'
const appRoot = path.join(projectRoot, 'app')
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.exposeFunction('readNativeFile', async file => {
    const prefix = pathToFileURL(`${appRoot}/static/papers/`).href
    if (!file.startsWith(prefix) || !/^CET[46]-\d{4}-\d{2}-[123]\.json$/.test(file.slice(prefix.length))) throw new Error('Invalid mock native file')
    return fs.readFile(path.join(appRoot, 'static/papers', file.slice(prefix.length)), 'utf8')
  })
  await page.addInitScript(({ root }) => {
    window.__nativeEvents = { splashClosed: false, quit: false, status: '', callbacks: {}, toast: '' }
    window.addEventListener('cet:ready', () => { window.__nativeEvents.ready = true })
    const storage = {
      getItem: key => localStorage.getItem(`native:${key}`),
      setItem: (key, value) => localStorage.setItem(`native:${key}`, value),
      removeItem: key => localStorage.removeItem(`native:${key}`),
      getLength: () => Object.keys(localStorage).filter(key => key.startsWith('native:')).length,
      key: index => Object.keys(localStorage).filter(key => key.startsWith('native:'))[index]?.slice(7),
    }
    if (!storage.getItem('cet:font')) storage.setItem('cet:font', JSON.stringify({ type: 'number', data: 21 }))
    const runtime = {
      storage,
      io: {
        convertLocalFileSystemURL: file => `${root}${file.slice(5)}`,
        resolveLocalFileSystemURL(file, success, fail) { window.readNativeFile(file).then(text => success({ file(callback) { callback({ text }) } }), fail) },
        FileReader: class {
          readAsText(file) { setTimeout(() => this.onloadend?.({ target: { result: file.text } }), 0) }
        },
      },
      navigator: {
        closeSplashscreen: () => { window.__nativeEvents.splashClosed = true },
        setStatusBarStyle: style => { window.__nativeEvents.status = style },
        setStatusBarBackground() {},
      },
      key: { addEventListener: (name, callback) => { window.__nativeEvents.callbacks[name] = callback } },
      runtime: { quit: () => { window.__nativeEvents.quit = true } },
      nativeUI: { toast: text => { window.__nativeEvents.toast = text } },
    }
    setTimeout(() => { window.plus = runtime; document.dispatchEvent(new Event('plusready')) }, 100)
  }, { root: pathToFileURL(`${appRoot}/`).href })
  await page.goto(`${pathToFileURL(path.join(appRoot, 'index.html')).href}#/`)
  await expect(page.locator('.paper-row')).toHaveCount(3)
  expect(await page.locator('.page-title').evaluate(el => getComputedStyle(el).fontSize)).toBe('56px')
  await expect.poll(async () => {
    return page.evaluate(() => window.__nativeEvents.ready && window.__nativeEvents.splashClosed)
  }).toBe(true)
  await page.locator('.year-chip').filter({ hasText: '2025' }).click()
  await page.locator('.paper-row').first().click()
  await page.locator('.section-row').filter({ hasText: '选词填空' }).click()
  await expect(page.locator('.cloze-blank')).toHaveCount(10)
  await expect(page.locator('.paper-journey')).toHaveCount(0)
  await page.locator('.cloze-blank').first().click()
  await expect(page.locator('.word-picker .option')).toHaveCount(15)
  await page.evaluate(() => window.__CET_NATIVE_BACK__())
  await expect(page.locator('.word-picker')).toHaveCount(0)
  await page.locator('.cloze-blank').first().click()
  const answer = await page.locator('.word-picker .option-label').first().innerText()
  await page.locator('.word-picker .option').first().click()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(1)
  const record = await page.evaluate(() => JSON.parse(plus.storage.getItem('cet:progress:v1:CET4-2025-12-1:cloze')))
  expect(record.data.answers['26']).toBe(answer)
  expect(await page.locator('.practice').evaluate(el => el.style.getPropertyValue('--reading-size'))).toBe('21px')
  await page.reload()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(1)
  await page.locator('.check-answers-button').click()
  await expect(page.locator('.results-sheet')).toBeVisible()
  await page.evaluate(() => window.__CET_NATIVE_BACK__())
  await expect(page.locator('.results-sheet')).toHaveCount(0)
  await page.screenshot({ path: 'E:/四六级真题/work/app-previews/native-local-file-cloze.png' })
  await page.evaluate(() => window.__CET_NATIVE_BACK__())
  await expect(page.locator('.heading-row')).toBeVisible()
  await expect(page.locator('.paper-journey')).toHaveCount(0)
  await page.locator('.year-chip').filter({ hasText: '2025' }).click()
  await page.locator('.paper-row').first().click()
  await page.locator('.section-row').filter({ hasText: '听力理解' }).click()
  await page.locator('.audio-play-button').click()
  await expect(page.locator('.audio-play-button')).toHaveText('暂停')
  await expect.poll(() => page.locator('.audio-times').innerText()).not.toBe('00:00\n00:00')
  await page.evaluate(() => document.dispatchEvent(new Event('pause')))
  await expect(page.locator('.audio-play-button')).toHaveText('播放')
  expect(await page.evaluate(() => plus.storage.getItem('cet:audio:v1:CET4-2025-12-1'))).not.toBeNull()
  await page.evaluate(() => document.dispatchEvent(new Event('resume')))
  await page.evaluate(() => window.__CET_NATIVE_BACK__())
  await expect(page.locator('.heading-row')).toBeVisible()
  await expect(page.locator('.paper-journey')).toHaveCount(0)
  await page.evaluate(() => window.__nativeEvents.callbacks.backbutton())
  expect(await page.evaluate(() => window.__nativeEvents.toast)).toBe('再按一次退出应用')
  expect(await page.evaluate(() => window.__nativeEvents.quit)).toBe(false)
  await page.evaluate(() => window.__nativeEvents.callbacks.backbutton())
  expect(await page.evaluate(() => window.__nativeEvents.quit)).toBe(true)
  expect(errors).toEqual([])
  console.log('5+ file:// UI passed: plusready startup/splash, Motion routing, compatible native storage, local papers/audio, background pause, hardware back and double-back quit.')
} finally { await browser.close() }

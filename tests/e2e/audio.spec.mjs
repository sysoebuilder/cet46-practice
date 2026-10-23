import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const recordings = JSON.parse(readFileSync(new URL('../../src/data/audio.json', import.meta.url), 'utf8'))

test('real local audio plays, pauses, seeks, survives changing questions and resumes', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio
    window.testAudioElements = []
    window.Audio = function (...args) { const audio = new OriginalAudio(...args); window.testAudioElements.push(audio); return audio }
    window.Audio.prototype = OriginalAudio.prototype
  })
  await page.goto('/#/pages/practice/index?paper=CET4-2024-12-1&section=listening')
  await expect(page.locator('.listening-player')).toBeVisible()
  await expect(page.locator('.resource-note')).toHaveCount(0)
  await page.locator('.audio-play-button').click()
  await expect(page.locator('.audio-play-button')).toHaveText('暂停')
  await expect.poll(async () => page.locator('.audio-times').innerText()).not.toBe('00:00\n00:00')
  await page.locator('.next-button').click()
  await expect(page.locator('.audio-play-button')).toHaveText('暂停')
  await expect(page.locator('.position')).toHaveText('2 / 8组')
  await page.locator('.audio-play-button').click()
  await expect(page.locator('.audio-play-button')).toHaveText('播放')
  const slider = page.locator('.audio-slider')
  const box = await slider.boundingBox()
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
  const key = 'cet:audio:v1:CET4-2024-12-1'
  const getPosition = () => page.evaluate(key => {
    const raw = JSON.parse(localStorage.getItem(key))
    return (raw?.data || raw)?.position || 0
  }, key)
  await expect.poll(getPosition).toBeGreaterThan(20)
  const saved = await getPosition()
  await page.screenshot({ path: `E:/四六级真题/work/app-previews/${testInfo.project.name}-listening-audio.png`, fullPage: true })
  await page.reload()
  await expect(page.locator('.audio-play-button')).toHaveText('播放')
  await page.locator('.audio-play-button').click()
  await page.locator('.back-button').click()
  await expect(page.locator('.heading-row')).toBeVisible()
  await expect.poll(getPosition).toBeGreaterThan(saved - 2)
  expect(await page.evaluate(() => window.testAudioElements.length > 0 && window.testAudioElements.every(audio => audio.paused))).toBeTruthy()
})

test('missing question sets may play audio alone without creating fake questions or progress', async ({ page }) => {
  await page.goto('/')
  await page.locator('.year-chip').filter({ hasText: /^2023$/ }).click()
  const session = page.locator('.session-card').filter({ has: page.locator('.session-heading', { hasText: /2023\s*\/\s*06/ }) })
  await session.locator('.paper-row').filter({ hasText: '第3套' }).click()
  await page.locator('.section-row').filter({ hasText: '听力理解' }).click()
  await expect(page.locator('.uni-modal')).toContainText('题目缺失')
  await page.getByText('播放音频', { exact: true }).click()
  await expect(page.locator('.page-state')).toContainText('本套真题缺少听力理解题目')
  await expect(page.locator('.listening-player')).toBeVisible()
  await page.locator('.audio-play-button').click()
  await expect(page.locator('.audio-play-button')).toHaveText('暂停')
  await expect(page.locator('.question-panel')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('cet:progress:v1:CET4-2023-06-3:listening'))).toBeNull()
})

test('every bundled recording has a decodable real audio track', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/')
  const results = await page.evaluate(async recordings => {
    const results = []
    for (const [id, asset] of Object.entries(recordings)) {
      results.push(await new Promise(resolve => {
        const audio = new Audio()
        const timer = setTimeout(() => finish(0), 8000)
        const finish = duration => { clearTimeout(timer); audio.pause(); audio.removeAttribute('src'); audio.load(); resolve({ id, duration }) }
        audio.preload = 'metadata'
        audio.onloadedmetadata = () => finish(audio.duration)
        audio.onerror = () => finish(0)
        audio.src = asset.src
      }))
    }
    return results
  }, recordings)
  for (const result of results) expect(result.duration, result.id).toBeGreaterThan(60)
})

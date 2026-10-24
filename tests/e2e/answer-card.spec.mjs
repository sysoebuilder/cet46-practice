import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildSections, listeningGroups } from '../../src/utils/paper.mjs'

const id = 'CET6-2017-06-2'
const paper = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
const items = buildSections(paper).find(section => section.id === 'listening').items

for (const width of [320, 360, 390]) {
  test(`answer card contains all 25 questions and status text at ${width}px with large reading text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const altered = structuredClone(paper)
    delete altered.solutions.items[items[24].key]
    await page.route(`**/static/papers/${id}.json`, route => route.fulfill({ json: altered }))
    const answers = {
      [items[0].key]: paper.solutions.items[items[0].key].answer,
      [items[1].key]: items[1].options.find(option => option.label !== paper.solutions.items[items[1].key].answer).label,
      // Exercise a missing key together with a saved answer, the longest tile.
      [items[24].key]: 'A',
    }
    await page.goto('/')
    await page.evaluate(({ id, answers }) => {
      localStorage.setItem('cet:font', JSON.stringify({ type: 'number', data: 21 }))
      localStorage.setItem(`cet:progress:v1:${id}:listening`, JSON.stringify({ type: 'object', data: {
        paperId: id, sectionId: 'listening', checked: true, answers, currentIndex: 0,
      } }))
    }, { id, answers })
    await page.goto(`/#/pages/practice/index?paper=${id}&section=listening`)
    await expect.poll(() => page.locator('.practice').evaluate(el => getComputedStyle(el).getPropertyValue('--reading-size'))).toBe('21px')
    await page.locator('.answer-card-button').click()
    const tiles = page.locator('.answer-number')
    await expect(tiles).toHaveCount(25)
    await expect(tiles.first()).toHaveClass(/checked-correct/)
    await expect(tiles.nth(1)).toHaveClass(/checked-incorrect/)
    await expect(tiles.nth(2).locator('.answer-number-result')).toHaveText('未答')
    await expect(tiles.last().locator('.answer-number-result')).toHaveText('答案缺失')
    await expect(tiles.first().locator('.answer-number-choice')).toHaveText(answers[items[0].key])
    // Wait for the actual spring to settle before measuring viewport bounds.
    await expect.poll(() => page.locator('.motion-sheet').evaluate(el => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      return Math.abs(matrix.m42)
    })).toBeLessThan(0.5)
    const layout = await tiles.evaluateAll(elements => elements.map(tile => {
      const box = tile.getBoundingClientRect()
      const labels = [...tile.querySelectorAll('.answer-number-label, .answer-number-choice, .answer-number-result')]
      return {
        width: box.width, height: box.height,
        overflow: tile.scrollHeight > tile.clientHeight || tile.scrollWidth > tile.clientWidth,
        contained: labels.every(label => {
          const bounds = label.getBoundingClientRect()
          return bounds.top >= box.top && bounds.bottom <= box.bottom && bounds.left >= box.left && bounds.right <= box.right
        }),
        statusSize: getComputedStyle(tile.querySelector('.answer-number-result')).fontSize,
      }
    }))
    for (const tile of layout) {
      expect(tile.width).toBeGreaterThanOrEqual(44)
      expect(tile.height).toBeGreaterThanOrEqual(76)
      expect(tile.contained).toBe(true)
      expect(tile.overflow).toBe(false)
      expect(tile.statusSize).toBe('12px')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await tiles.last().scrollIntoViewIfNeeded()
    await expect(tiles.last()).toBeInViewport()
    await page.screenshot({ path: `E:/四六级真题/work/app-previews/answer-card-${width}.png` })
    await tiles.last().click()
    await expect(page.locator('.motion-overlay')).toHaveCount(0)
    const groups = listeningGroups({ items }).length
    await expect(page.locator('.position')).toHaveText(`${groups} / ${groups}组`)
    expect(errors).toEqual([])
  })
}

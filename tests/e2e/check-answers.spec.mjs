import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildSections, listeningGroups } from '../../src/utils/paper.mjs'

const id = 'CET4-2025-12-1'
const paper = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
const previews = 'E:/四六级真题/work/app-previews'
const section = name => buildSections(paper).find(s => s.id === name)
const key = item => paper.solutions.items[item.key].answer
const wrong = item => item.options.find(o => o.label !== key(item)).label
const progressKey = name => `cet:progress:v1:${id}:${name}`
async function saved(page, name) {
  return page.evaluate(key => { const raw = JSON.parse(localStorage.getItem(key)); return raw?.data || raw }, progressKey(name))
}
async function open(page, name) {
  await page.goto('/')
  await page.goto(`/#/pages/practice/index?paper=${id}&section=${name}`)
  await expect(page.locator('.startup-motion')).toHaveCount(0)
  await expect(page.locator('.check-answers-button')).toBeVisible()
}
async function answerReading(page, index, label) {
  if (!await page.locator('.reading-picker').count()) await page.locator('.floating-answer-button').click()
  const entry = page.locator('.question-entry').nth(index)
  await entry.locator('.question-summary').click()
  await entry.locator('.option').filter({ has: page.locator('.option-label', { hasText: new RegExp(`^${label}$`) }) }).click()
}
async function closeReading(page) { await page.locator('.reading-picker .close-button').click() }

for (const name of ['matching', 'reading']) {
  test(`${name} checks the whole type, preserves wrong responses, explains answers and redoes only this type`, async ({ page }, testInfo) => {
    const items = section(name).items
    await open(page, 'writing')
    await page.locator('textarea').fill('A draft that must survive redoing reading.')
    await open(page, name)
    await answerReading(page, 0, key(items[0]))
    await answerReading(page, 1, wrong(items[1]))
    await closeReading(page)
    await checkAnswers(page)
    await expect(page.locator('.question-entry.checked-correct')).toHaveCount(1)
    await expect(page.locator('.question-entry.checked-incorrect')).toHaveCount(1)
    await expect(page.locator('.question-entry.checked-unanswered')).toHaveCount(8)
    const incorrect = page.locator('.question-entry').nth(1)
    await expect(incorrect.locator('.chosen-answer')).toContainText(`已选 ${wrong(items[1])}`)
    await expect(incorrect.locator('.result-answer')).toContainText(`正确答案 ${key(items[1])}`)
    await incorrect.locator('.result-answer').click()
    await expect(page.locator('.explanation-sheet')).toBeVisible()
    await expect(page.locator('.explanation-response')).toContainText(wrong(items[1]))
    await expect(page.locator('.review-letter')).toHaveText(key(items[1]))
    await expect(page.locator('.review-body')).toHaveText(paper.solutions.items[items[1].key].explanation || '解析暂缺')
    await page.locator('.explanation-sheet .close-button').click()
    await expect(page.locator('.question-entry')).toHaveCount(10)
    await incorrect.locator('.question-summary').click()
    await expect(incorrect.locator('.incorrect-choice.chosen .option-label')).toHaveText(wrong(items[1]))
    await expect(incorrect.locator('.correct-choice .option-label')).toHaveText(key(items[1]))
    await incorrect.locator('.correct-choice').dispatchEvent('click')
    expect((await saved(page, name)).answers[items[1].key]).toBe(wrong(items[1]))
    await page.screenshot({ path: `${previews}/${testInfo.project.name}-${name}-checked.png`, fullPage: true })
    await page.reload()
    await expect(page.locator('.redo-button')).toBeVisible()
    await page.locator('.floating-answer-button').click()
    await expect(page.locator('.question-entry.checked-incorrect')).toHaveCount(1)
    await closeReading(page)
    await page.locator('.redo-button').click()
    await expect(page.locator('.check-answers-button')).toBeVisible()
    await expect(page.locator('.answered-count')).toHaveText('已答 0')
    expect((await saved(page, name)).answers).toEqual({})
    expect((await saved(page, 'writing')).answers['writing-0']).toContain('must survive')
    await page.reload()
    await expect(page.locator('.check-answers-button')).toBeVisible()
    await page.locator('.floating-answer-button').click()
    await expect(page.locator('.chosen-answer')).toHaveCount(0)
  })
}

test('cloze retains chosen words inline, marks mistakes and blanks and opens the explanation on the answer', async ({ page }, testInfo) => {
  const items = section('cloze').items
  await open(page, 'cloze')
  for (const [index, label] of [[0, key(items[0])], [1, wrong(items[1])]]) {
    await page.locator('.cloze-blank').nth(index).click()
    await page.locator('.word-picker .option').filter({ has: page.locator('.option-label', { hasText: new RegExp(`^${label}$`) }) }).click()
  }
  const wrongWord = items[1].options.find(o => o.label === wrong(items[1])).text
  await checkAnswers(page)
  await expect(page.locator('.cloze-blank.checked-correct')).toHaveCount(1)
  await expect(page.locator('.cloze-blank.checked-incorrect')).toHaveText(`${wrong(items[1])}) ${wrongWord}×`)
  await expect(page.locator('.cloze-blank.checked-unanswered')).toHaveCount(8)
  await expect(page.locator('[data-correction="27"]')).toContainText(key(items[1]))
  await page.screenshot({ path: `${previews}/${testInfo.project.name}-cloze-checked.png`, fullPage: true })
  await page.locator('[data-correction="27"]').click()
  await expect(page.locator('.review-letter')).toHaveText(key(items[1]))
  await expect(page.locator('.explanation-response')).toContainText(wrongWord)
  await page.locator('.explanation-sheet .close-button').click()
  await page.reload()
  await expect(page.locator('.cloze-blank.checked-incorrect')).toContainText(wrongWord)
  await page.locator('.redo-button').click()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(0)
  await expect(page.locator('.cloze-correction')).toHaveCount(0)
  await page.locator('.cloze-blank').first().click()
  await expect(page.locator('.word-picker .option')).toHaveCount(15)
})

test('listening checks all groups, retains original selections and keeps audio progress when redoing', async ({ page }, testInfo) => {
  const data = JSON.parse(readFileSync(new URL('../../src/static/papers/CET6-2017-06-2.json', import.meta.url), 'utf8'))
  const items = buildSections(data).find(s => s.id === 'listening').items
  const id = data.id
  await page.goto(`/#/pages/practice/index?paper=${id}&section=listening`)
  const firstKey = data.solutions.items[items[0].key].answer
  const incorrect = items[1].options.find(o => o.label !== data.solutions.items[items[1].key].answer).label
  await page.locator('.listening-question').nth(0).locator('.option').filter({ has: page.locator('.option-label', { hasText: new RegExp(`^${firstKey}$`) }) }).click()
  await page.locator('.listening-question').nth(1).locator('.option').filter({ has: page.locator('.option-label', { hasText: new RegExp(`^${incorrect}$`) }) }).click()
  await checkAnswers(page)
  await expect(page.locator('.listening-question.checked-correct')).toHaveCount(1)
  await expect(page.locator('.listening-question.checked-incorrect')).toHaveCount(1)
  await page.locator('.listening-question').nth(1).locator('.result-answer').click()
  await expect(page.locator('.explanation-response')).toContainText(incorrect)
  await page.locator('.explanation-sheet .close-button').click()
  await page.screenshot({ path: `${previews}/${testInfo.project.name}-listening-checked.png`, fullPage: true })
  await page.locator('.next-button').click()
  await expect(page.locator('.listening-question.checked-unanswered')).not.toHaveCount(0)
  await page.evaluate(id => localStorage.setItem(`cet:audio:v1:${id}`, JSON.stringify({ data: { position: 121, fingerprint: 'test' } })), id)
  const audioBefore = await page.evaluate(id => localStorage.getItem(`cet:audio:v1:${id}`), id)
  await page.locator('.redo-button').click()
  await expect(page.locator('.answered-count')).toHaveText('已答 0')
  await expect(page.locator('.position')).toHaveText(`1 / ${listeningGroups({ items }).length}组`)
  expect(await page.evaluate(id => localStorage.getItem(`cet:audio:v1:${id}`), id)).toBe(audioBefore)
})

test('missing keys remain ungraded, while subjective drafts stay intact for reference comparison', async ({ page }) => {
  const altered = structuredClone(paper)
  delete altered.solutions.items['46']
  altered.solutions.references.writing = [{ kind: 'writing', title: '参考答案', text: 'A reference composition.' }]
  await page.route(`**/static/papers/${id}.json`, route => route.fulfill({ json: altered }))
  await open(page, 'reading')
  await answerReading(page, 0, 'A')
  await closeReading(page)
  await checkAnswers(page)
  const entry = page.locator('.question-entry').first()
  await expect(entry).toHaveClass(/checked-missing/)
  await expect(entry.locator('.result-status')).toHaveText('答案缺失')
  await expect(entry.locator('.chosen-answer')).toContainText('已选 A')
  await open(page, 'writing')
  await page.locator('textarea').fill('My own composition must remain.')
  await checkAnswers(page)
  await expect(page.locator('textarea')).toHaveValue('My own composition must remain.')
  await page.locator('.result-answer').click()
  await expect(page.locator('.review-body')).toHaveText('A reference composition.')
  await page.locator('.explanation-sheet .close-button').click()
  await page.locator('.redo-button').click()
  await expect(page.locator('textarea')).toHaveValue('')
  await expect(page.locator('textarea')).toBeEnabled()
})

test('redo rolls back visibly on storage failure and removed modules have no entry or route', async ({ page }) => {
  await page.goto('/#/pages/history/index')
  await expect(page.locator('.heading-row')).toBeVisible()
  await expect(page.getByText('历史', { exact: true })).toHaveCount(0)
  await page.locator('.paper-row').first().click()
  await expect(page.getByText('整卷评分', { exact: true })).toHaveCount(0)
  await open(page, 'cloze')
  await expect(page.getByText('评分', { exact: true })).toHaveCount(0)
  await page.locator('.cloze-blank').first().click()
  await page.locator('.option').first().click()
  await checkAnswers(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    window.restoreStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('cet:progress:')) throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.locator('.redo-button').click()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(1)
  await expect(page.locator('.redo-button')).toBeVisible()
  await expect(page.locator('.save-state')).toHaveText('保存失败')
  await page.evaluate(() => window.restoreStorage())
  await page.locator('.redo-button').click()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(0)
})

// Checking now opens a Motion bottom sheet. Close the summary to continue
// the existing inline-result and persistence regressions below it.
async function checkAnswers(page) {
  await page.locator('.check-answers-button').click()
  await expect(page.locator('.redo-button')).toBeVisible()
  if (await page.locator('.results-sheet').count()) {
    await page.locator('.results-sheet .close-button').click()
    await expect(page.locator('.results-sheet')).toHaveCount(0)
  }
}

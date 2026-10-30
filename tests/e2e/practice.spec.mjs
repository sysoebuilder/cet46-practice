import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const previewDirectory = 'E:/四六级真题/work/app-previews'

async function selectPaper(page, { level = '四级', year = 2025, month = 6, set = 1 } = {}) {
  await page.locator('.level-button').filter({ hasText: level }).click()
  await page.locator('.year-chip').filter({ hasText: new RegExp(`^${year}$`) }).click()
  const session = page.locator('.session-card').filter({ has: page.locator('.session-heading', { hasText: new RegExp(`${year}\\s*/\\s*${String(month).padStart(2, '0')}`) }) })
  await session.locator('.paper-row').filter({ hasText: `第${set}套` }).click()
  await expect(page.locator('.section-row')).toHaveCount(6)
}

async function openReadingQuestion(page, index = 0) {
  if (!await page.locator('.reading-picker').count()) await page.locator('.floating-answer-button').click()
  const entry = page.locator('.question-entry').nth(index)
  if (!await entry.locator('.question-dropdown').count()) await entry.locator('.question-number').click()
  await expect(entry.locator('.question-dropdown')).toBeVisible()
}
async function closeReadingQuestions(page) {
  if (await page.locator('.reading-picker').count()) await page.locator('.reading-picker .close-button').click()
}

for (const [id, title] of [
  ['CET4-2025-12-1', 'CET4 December 2025 set 1'],
  ['CET4-2025-12-3', 'CET4 December 2025 set 3'],
  ['CET4-2018-06-2', 'CET4 June 2018 set 2 corrected keys'],
  ['CET6-2022-06-3', 'CET6 June 2022 set 3 inferred keys'],
]) {
test(`${title} checks all thirty reading answers`, async ({ page }) => {
  const data = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
  for (const section of ['cloze', 'matching', 'reading']) {
    await page.goto('/')
    await page.goto(`/#/pages/practice/index?paper=${id}&section=${section}`)
    await checkAnswers(page)
    if (section === 'cloze') {
      await expect(page.locator('.cloze-correction')).toHaveCount(10)
      for (let index = 0; index < 10; index++) await expect(page.locator('.cloze-correction').nth(index)).toContainText(data.solutions.items[String(26 + index)].answer)
    } else {
      const pages = section === 'reading' ? data.Reading.passage_comprehension.passages.length : 1
      for (let group = 0; group < pages; group++) {
        const questions = section === 'reading' ? data.Reading.passage_comprehension.passages[group].questions : null
        const count = questions ? questions.length : 10
        await expect(page.locator('.question-entry .result-answer')).toHaveCount(count)
        for (let index = 0; index < count; index++) await expect(page.locator('.question-entry .result-answer').nth(index)).toContainText(data.solutions.items[String(questions ? questions[index].number : 36 + index)].answer)
        if (group + 1 < pages) { await closeReadingQuestions(page); await page.locator('.next-button').click(); await page.locator('.floating-answer-button').click() }
      }
    }
  }
})
}

async function checkAndExplainReading(page, index = 0) {
  await closeReadingQuestions(page)
  await checkAnswers(page)
  await page.locator('.question-entry').nth(index).locator('.result-hint').click()
}

async function openType(page, name) {
  await page.goto('/')
  await selectPaper(page)
  await page.locator('.section-row').filter({ hasText: name }).click()
  if (['长篇阅读', '仔细阅读'].includes(name)) await openReadingQuestion(page)
  else await expect(page.locator(name === '选词填空' ? '.cloze-passage' : name === '听力理解' ? '.listening-group-panel' : '.question-panel')).toBeVisible()
}
test('paper selection, floating reading questions and progress survive reopening', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.heading-row .subtle')).toHaveText('64 套')
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-home.png`, fullPage: true })
  await selectPaper(page)
  expect(await page.locator('.type-mark').evaluateAll(marks => new Set(marks.map(mark => `${getComputedStyle(mark).backgroundColor}/${getComputedStyle(mark).color}`)).size)).toBe(1)
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-types.png`, fullPage: true })
  await page.locator('.section-row').filter({ hasText: '仔细阅读' }).click()
  await expect(page.locator('.material-panel')).toBeVisible()
  await expect(page.locator('.question-panel')).toHaveCount(0)
  await expect(page.locator('.option')).toHaveCount(0)
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-reading.png`, fullPage: true })
  await page.locator('.floating-answer-button').click()
  await expect(page.locator('.question-entry')).toHaveCount(5)
  await expect(page.locator('.option')).toHaveCount(0)
  await openReadingQuestion(page)
  await expect(page.locator('.question-entry').first().locator('.question-stem')).toContainText('pandas')
  await expect(page.locator('.option')).toHaveCount(4)
  const firstChoice = await page.locator('.option').first().locator('.option-label').innerText()
  await page.locator('.option').first().locator('.option-label').click()
  await expect(page.locator('.question-entry').first().locator('.chosen-answer')).toContainText(`已选 ${firstChoice}`)
  await expect(page.locator('.option')).toHaveCount(0)
  await openReadingQuestion(page, 1)
  await expect(page.locator('.position')).toHaveText('2 / 10')
  const secondChoice = await page.locator('.option').nth(2).locator('.option-label').innerText()
  await page.locator('.option').nth(2).locator('.option-label').click()
  await page.reload()
  await expect(page.locator('.position')).toHaveText('2 / 10')
  await page.locator('.floating-answer-button').click()
  await expect(page.locator('.question-entry').nth(1).locator('.chosen-answer')).toContainText(`已选 ${secondChoice}`)
  await openReadingQuestion(page, 1)
  await expect(page.locator('.option').nth(2)).toHaveClass(/chosen/)
  await expect(page.locator('.answered-count')).toHaveText('已答 2')
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-reading-dropdown.png`, fullPage: true })
  await openReadingQuestion(page, 0)
  await expect(page.locator('.position')).toHaveText('1 / 10')
  await expect(page.locator('.option').first()).toHaveClass(/chosen/)
  await closeReadingQuestions(page)
  await page.locator('.answer-card-button').click()
  await expect(page.locator('.answer-number.filled')).toHaveCount(2)
  await expect(page.locator('.answer-number').first().locator('.answer-number-choice')).toHaveText(firstChoice)
  await page.locator('.answer-number').first().click()
  await expect(page.locator('.option').first()).toHaveClass(/chosen/)
  await closeReadingQuestions(page)
  await page.locator('.back-button').click()
  await page.locator('.year-chip').filter({ hasText: /^2025$/ }).click()
  await expect(page.locator('.paper-progress')).toHaveText('已答 2 题')
  await page.locator('.resume-card').click()
  await openReadingQuestion(page)
  await expect(page.locator('.option').first()).toHaveClass(/chosen/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})

test('writing advances to translation with separate saved drafts, and final completion reports saved work', async ({ page }) => {
  await openType(page, '写作')
  const draft = 'Learning is a daily habit.\nKeep going, one step at a time.'
  await page.locator('textarea').fill(draft)
  await page.reload()
  await expect(page.locator('textarea')).toHaveValue(draft)
  await page.locator('.next-button').click()
  await expect(page.locator('.practice-title')).toHaveText('翻译')
  await expect(page.locator('textarea')).toHaveValue('')
  await page.locator('textarea').fill('Yuan Longping and his research team overcame many difficulties.')
  await page.reload()
  await expect(page.locator('textarea')).toHaveValue('Yuan Longping and his research team overcame many difficulties.')
  await page.locator('.next-button').click()
  await expect(page.locator('.sheet-title')).toHaveText('练习已保存')
  await expect(page.locator('.completion-count')).toHaveText('1 / 1')
  await page.locator('.completion .primary-button').click()
  await selectPaper(page)
  await page.locator('.section-row').filter({ hasText: '写作' }).click()
  await expect(page.locator('textarea')).toHaveValue(draft)
})
test('cloze, paragraph matching and listening show original question structures', async ({ page }) => {
  await openType(page, '选词填空')
  await expect(page.locator('.question-panel')).toHaveCount(0)
  await expect(page.locator('.cloze-blank')).toHaveCount(10)
  await page.locator('.cloze-blank').first().locator('.blank-label').click()
  await expect(page.locator('.option')).toHaveCount(15)
  const word = await page.locator('.option').nth(4).locator('.option-text').innerText()
  const label = await page.locator('.option').nth(4).locator('.option-label').innerText()
  await page.locator('.option').nth(4).locator('.option-label').click()
  await expect(page.locator('.word-picker')).toHaveCount(0)
  await expect(page.locator('.cloze-blank').first()).toHaveText(`${label}) ${word}`)
  await page.reload()
  await expect(page.locator('.cloze-blank').first()).toHaveText(`${label}) ${word}`)
  await page.locator('.cloze-blank').first().locator('.blank-label').click()
  await expect(page.locator('.option').nth(4)).toHaveClass(/chosen/)
  await page.locator('.close-button').click()
  await page.locator('.back-button').click()
  await selectPaper(page)
  await page.locator('.section-row').filter({ hasText: '长篇阅读' }).click()
  await expect(page.locator('.labeled-paragraph')).toHaveCount(13)
  await openReadingQuestion(page)
  await expect(page.locator('.option')).toHaveCount(13)
  await page.locator('.option').nth(2).locator('.option-label').click()
  await page.reload()
  await openReadingQuestion(page)
  await expect(page.locator('.option').nth(2)).toHaveClass(/chosen/)
  await closeReadingQuestions(page)
  await page.locator('.back-button').click()
  await selectPaper(page)
  await page.locator('.section-row').filter({ hasText: '听力理解' }).click()
  await expect(page.locator('.listening-player')).toBeVisible()
  await expect(page.locator('.resource-note')).toHaveCount(0)
  await expect(page.locator('.listening-question')).toHaveCount(2)
  await expect(page.locator('.option')).toHaveCount(8)
  await expect(page.locator('.question-stem')).toHaveCount(0)
})
test('failed saving stays visible and cannot be mistaken for completed work', async ({ page }) => {
  await openType(page, '仔细阅读')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    window.restoreStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('cet:progress:')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.locator('.option').first().locator('.option-label').click()
  await expect(page.locator('.save-state')).toHaveText('保存失败')
  await closeReadingQuestions(page)
  await page.locator('.previous-button').click()
  await expect(page.locator('.practice-title')).toHaveText('仔细阅读')
  await page.locator('.back-button').click()
  await expect(page.locator('.material-panel')).toBeVisible()
  await page.evaluate(() => window.restoreStorage())
  await page.locator('.save-error .text-button').click()
  await expect(page.locator('.save-state')).toHaveText('已自动保存')
  await page.reload()
  await openReadingQuestion(page)
  await expect(page.locator('.option').first()).toHaveClass(/chosen/)
})

test('remaining missing reading and writing stay selectable and explain the omission', async ({ page }, testInfo) => {
  await page.goto('/')
  await selectPaper(page, { year: 2022, month: 6, set: 3 })
  for (const name of ['选词填空', '长篇阅读', '仔细阅读']) {
    const row = page.locator('.section-row').filter({ hasText: name })
    await expect(row.locator('.section-meta')).toHaveText('题目缺失')
    await row.click()
    await expect(page.locator('.app-modal')).toContainText(`本套真题缺少${name}题目，请选择其他题型。`)
    await page.getByText('知道了', { exact: true }).click()
    await expect(page.locator('.section-sheet')).toBeVisible()
    await expect(page.locator('.question-panel')).toHaveCount(0)
  }
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-missing-sections.png`, fullPage: true })
  await page.locator('.section-row').filter({ hasText: '翻译' }).click()
  await expect(page.locator('textarea')).toBeVisible()
  await page.locator('.back-button').click()
  await selectPaper(page, { level: '六级', year: 2019, month: 12, set: 2 })
  await page.locator('.section-row').filter({ hasText: '写作' }).click()
  await expect(page.locator('.app-modal')).toContainText('本套真题缺少写作题目，请选择其他题型。')
  await page.getByText('知道了', { exact: true }).click()
  await expect(page.locator('.section-sheet')).toBeVisible()
})

test('direct links to missing questions cannot create empty saved attempts', async ({ page }) => {
  for (const [paperId, sectionId, name] of [
    ['CET4-2022-06-3', 'reading', '仔细阅读'],
    ['CET6-2019-12-2', 'writing', '写作'],
  ]) {
    await page.goto(`/#/pages/practice/index?paper=${paperId}&section=${sectionId}`)
    await expect(page.locator('.page-state')).toContainText(`本套真题缺少${name}题目，请选择其他题型。`)
    await expect(page.locator('.question-panel')).toHaveCount(0)
    expect(await page.evaluate(key => localStorage.getItem(key), `cet:progress:v1:${paperId}:${sectionId}`)).toBeNull()
    await page.locator('.page-state .primary-button').click()
    await expect(page.locator('.heading-row')).toBeVisible()
  }
})

test('newly supplemented PDF and external answer keys work with original options', async ({ page }) => {
  for (const id of ['CET6-2026-06-2', 'CET6-2025-12-3']) {
    const data = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
    const key = data.solutions.items['46']
    const question = data.Reading.passage_comprehension.passages[0].questions[0]
    const other = question.options.find(option => option.label !== key.answer).label
    await page.goto('/')
    await selectPaper(page, { level: '六级', year: data.year, month: data.month, set: data.set_number })
    await page.locator('.section-row').filter({ hasText: '仔细阅读' }).click()
    await openReadingQuestion(page)
    await page.locator('.option').filter({ has: page.locator('.option-label', { hasText: new RegExp(`^${other}$`) }) }).locator('.option-label').click()
    await openReadingQuestion(page)
    await checkAndExplainReading(page)
    await expect(page.locator('.review-letter')).toHaveText(key.answer)
    await expect(page.locator('.review-option-text')).toHaveText(question.options.find(option => option.label === key.answer).text)
    await expect(page.locator('.review-result')).toHaveText('回答有误')
    await expect(page.locator('.review-body')).toHaveText(key.explanation || '解析暂缺')
    await expect(page.locator('.review-answer-row .review-label')).toHaveText('答案')
    await expect(page.locator('.review-source')).toHaveCount(0)
    await page.reload()
    await openReadingQuestion(page)
    await expect(page.locator('.option.chosen .option-label')).toHaveText(other)
    await expect(page.locator('.answered-count')).toHaveText('已答 1')
  }
})

test('generated answers display as answers and answer-only rows do not appear as explanations', async ({ page }, testInfo) => {
  const id = 'CET4-2026-06-1'
  const data = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
  const key = data.solutions.items['46']
  await page.goto(`/#/pages/practice/index?paper=${id}&section=reading`)
  await openReadingQuestion(page)
  await page.locator('.option').first().locator('.option-label').click()
  await openReadingQuestion(page)
  await checkAndExplainReading(page)
  await expect(page.locator('.review-letter')).toHaveText(key.answer)
  await expect(page.locator('.review-answer-row .review-label')).toHaveText('答案')
  await expect(page.locator('.review-source')).toHaveCount(0)
  await expect(page.locator('.review-result')).toHaveText(key.answer === 'A' ? '回答正确' : '回答有误')
  await expect(page.locator('.review-body')).toHaveText('解析暂缺')
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-supplemented-answers.png`, fullPage: true })
  await page.reload()
  await openReadingQuestion(page)
  await expect(page.locator('.option').first()).toHaveClass(/chosen/)
  await expect(page.locator('.answer-review')).toHaveCount(0)
})


test('inline cloze fills every blank, reopens saved choices and advances to saved matching progress', async ({ page }, testInfo) => {
  await openType(page, '长篇阅读')
  await page.locator('.option').nth(2).locator('.option-label').click()
  await openReadingQuestion(page, 1)
  await closeReadingQuestions(page)
  await page.locator('.back-button').click()
  await selectPaper(page)
  await page.locator('.section-row').filter({ hasText: '选词填空' }).click()
  await expect(page.locator('.cloze-blank')).toHaveCount(10)
  for (let index = 0; index < 10; index++) {
    await page.locator('.cloze-blank').nth(index).locator('.blank-label').click()
    const option = page.locator('.word-picker .option').nth(index)
    const label = await option.locator('.option-label').innerText()
    const word = await option.locator('.option-text').innerText()
    await option.locator('.option-label').click()
    await expect(page.locator('.cloze-blank').nth(index)).toHaveText(`${label}) ${word}`)
  }
  await expect(page.locator('.answered-count')).toHaveText('已答 10')
  await expect(page.locator('.question-panel')).toHaveCount(0)
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-inline-cloze.png`, fullPage: true })
  await page.reload()
  await expect(page.locator('.cloze-blank.filled')).toHaveCount(10)
  await page.locator('.cloze-blank').first().locator('.blank-label').click()
  await expect(page.locator('.word-picker .option.chosen')).toHaveCount(1)
  await page.locator('.word-picker .close-button').click()
  await checkAnswers(page)
  await expect(page.locator('.redo-button')).toBeVisible()
  await page.locator('.next-button').click()
  await expect(page.locator('.practice-title')).toHaveText('长篇阅读')
  await expect(page.locator('.position')).toHaveText('2 / 10')
  await expect(page.locator('.answered-count')).toHaveText('已答 1')
  await page.locator('.answer-card-button').click()
  await page.locator('.answer-number').first().click()
  await expect(page.locator('.option').nth(2)).toHaveClass(/chosen/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('listening scrolls all questions in a recording group and advances to the next group and type', async ({ page }, testInfo) => {
  await openType(page, '听力理解')
  await expect(page.locator('.position')).toHaveText('1 / 8组')
  await expect(page.locator('.listening-question')).toHaveCount(2)
  await page.locator('.listening-question').first().locator('.option').nth(1).locator('.option-label').click()
  await page.locator('.listening-question').last().locator('.option').nth(2).locator('.option-label').click()
  await expect(page.locator('.listening-player')).toBeVisible()
  await page.locator('.next-button').click()
  await expect(page.locator('.position')).toHaveText('2 / 8组')
  await expect(page.locator('.listening-question').first().locator('.question-panel-heading')).toContainText('第 3 题')
  await page.locator('.previous-button').click()
  await expect(page.locator('.listening-question').first().locator('.option').nth(1)).toHaveClass(/chosen/)
  await expect(page.locator('.listening-question').last().locator('.option').nth(2)).toHaveClass(/chosen/)
  await page.locator('.answer-card-button').click()
  await page.locator('.answer-number').filter({ hasText: /^25$/ }).click()
  await expect(page.locator('.position')).toHaveText('8 / 8组')
  await expect(page.locator('.listening-question')).toHaveCount(4)
  await page.locator('.listening-question').last().locator('.option').first().locator('.option-label').click()
  await page.reload()
  await expect(page.locator('.position')).toHaveText('8 / 8组')
  await expect(page.locator('.answered-count')).toHaveText('已答 3')
  await expect(page.locator('.listening-question').last().locator('.option').first()).toHaveClass(/chosen/)
  await page.screenshot({ path: `${previewDirectory}/${testInfo.project.name}-listening-group.png`, fullPage: true })
  await page.locator('.next-button').click()
  await expect(page.locator('.practice-title')).toHaveText('写作')
  await expect(page.locator('textarea')).toHaveValue('')
})


test('careful reading groups passages, navigates both ways, and preserves answers', async ({ page }) => {
  test.setTimeout(90000)
  const id = 'CET4-2026-06-1'
  const data = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
  const passages = data.Reading.passage_comprehension.passages
  await page.goto(`/#/pages/practice/index?paper=${id}&section=reading`)
  for (let group = 0; group < 2; group++) {
    await expect(page.locator('.passage-title')).toHaveText(`Passage ${group + 1}`)
    await expect(page.locator('.material-scroll .reading-text')).toHaveText(passages[group].passage)
    await page.locator('.floating-answer-button').click()
    await expect(page.locator('.question-entry')).toHaveCount(5)
    for (let index = 0; index < 5; index++) {
      const entry = page.locator('.question-entry').nth(index)
      const question = passages[group].questions[index]
      await expect(entry.locator('.question-number')).toHaveText(String(question.number))
      await expect(entry.locator('.question-stem')).toHaveText(question.stem)
      await openReadingQuestion(page, index)
      await expect(entry.locator('.option-text')).toHaveText(question.options.map(option => option.text))
      if (index === 0) await entry.locator('.option').nth(group).locator('.option-label').click()
    }
    await closeReadingQuestions(page)
    await page.locator('.next-button').click()
  }
  await expect(page.locator('.practice-title')).toHaveText('听力理解')
  await page.locator('.previous-button').click()
  await expect(page.locator('.passage-title')).toHaveText('Passage 2')
  await page.locator('.floating-answer-button').click()
  await expect(page.locator('.question-entry').first().locator('.chosen-answer')).toContainText('已选 B')
  await closeReadingQuestions(page)
  await page.locator('.previous-button').click()
  await expect(page.locator('.passage-title')).toHaveText('Passage 1')
  await page.locator('.floating-answer-button').click()
  await expect(page.locator('.question-entry').first().locator('.chosen-answer')).toContainText('已选 A')
  await closeReadingQuestions(page)
  await page.locator('.answer-card-button').click()
  await page.locator('.answer-number').filter({ hasText: /^51/ }).click()
  await expect(page.locator('.passage-title')).toHaveText('Passage 2')
  await expect(page.locator('.question-entry').first().locator('.question-number')).toHaveText('51')
  await closeReadingQuestions(page)
  await page.reload()
  await expect(page.locator('.passage-title')).toHaveText('Passage 2')
  await page.locator('.previous-button').click()
  await page.locator('.previous-button').click()
  await expect(page.locator('.practice-title')).toHaveText('长篇阅读')
  await page.locator('.next-button').click()
  await expect(page.locator('.passage-title')).toHaveText('Passage 1')
})

test('PDF-recovered passages display their own questions and saved responses', async ({ page }) => {
  test.setTimeout(60000)
  for (const id of ['CET4-2018-06-2', 'CET4-2024-06-1']) {
    const data = JSON.parse(readFileSync(new URL(`../../src/static/papers/${id}.json`, import.meta.url), 'utf8'))
    await page.goto(`/#/pages/practice/index?paper=${id}&section=reading`)
    for (let group = 0; group < 2; group++) {
      const passage = data.Reading.passage_comprehension.passages[group]
      await expect(page.locator('.passage-title')).toHaveText(`Passage ${group + 1}`)
      await expect(page.locator('.material-scroll .reading-text')).toHaveText(passage.passage)
      await openReadingQuestion(page)
      await expect(page.locator('.question-entry')).toHaveCount(5)
      await expect(page.locator('.question-number')).toHaveText(passage.questions.map(q => String(q.number)))
      await expect(page.locator('.question-entry').first().locator('.option-text')).toHaveText(passage.questions[0].options.map(o => o.text))
      await page.locator('.question-entry').first().locator('.option').first().locator('.option-label').click()
      await closeReadingQuestions(page)
      if (!group) await page.locator('.next-button').click()
    }
    await page.reload()
    await expect(page.locator('.passage-title')).toHaveText('Passage 2')
    await page.locator('.previous-button').click()
    await openReadingQuestion(page)
    await expect(page.locator('.question-entry').first().locator('.option').first()).toHaveClass(/chosen/)
    await closeReadingQuestions(page)
  }
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

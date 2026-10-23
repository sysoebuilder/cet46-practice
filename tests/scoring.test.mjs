import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scorePaper, makeScoreRecord, paperResponses, reusableSelfScores, validSelfScore } from '../src/utils/scoring.mjs'
import { buildSections } from '../src/utils/paper.mjs'
import { groupPracticeHistory } from '../src/utils/history.mjs'
import { saveScore, readScores, allScores, allProgress } from '../src/utils/storage.js'
const paper = JSON.parse(readFileSync(new URL('../src/static/papers/CET6-2017-06-2.json', import.meta.url), 'utf8'))
function completeResponses() {
  return Object.fromEntries(buildSections(paper).map(section => [section.id, Object.fromEntries(section.items.map(item => [item.key, item.kind === 'text' ? 'A written response.' : paper.solutions.items[item.key].answer]))]))
}
function memoryStorage() {
  const map = new Map()
  return { getStorageSync: key => map.has(key) ? JSON.parse(map.get(key)) : '', setStorageSync: (key, value) => map.set(key, JSON.stringify(value)), getStorageInfoSync: () => ({ keys: [...map.keys()] }) }
}
test('all blank papers score zero, count all 55 objective blanks as wrong, and need no completion gate', () => {
  const result = scorePaper(paper)
  assert.equal(result.estimatedScore, 0)
  assert.equal(result.blank, 55)
  assert.equal(result.wrong, 55)
  assert.equal(result.complete, true)
  assert.equal(result.sections.find(section => section.id === 'writing').score, 0)
})
test('full correct keys plus two 15/15 self assessments total 710 without rounding drift', () => {
  const result = scorePaper(paper, completeResponses(), { writing: 15, translation: 15 })
  assert.equal(result.weightedScore, 100)
  assert.equal(result.estimatedScore, 710)
  assert.equal(result.correct, 55)
  assert.equal(result.wrong, 0)
  assert.equal(result.complete, true)
})
test('CET4 and CET6 use listening 1%/2% and reading .5%/1%/2% question weights', () => {
  for (const level of ['CET4', 'CET6']) {
    const input = { ...paper, level }
    const answers = completeResponses()
    const result = scorePaper(input, { listening: { 1: answers.listening['1'], 16: answers.listening['16'] }, cloze: { 26: answers.cloze['26'] }, matching: { 36: answers.matching['36'] }, reading: { 46: answers.reading['46'] } })
    assert.equal(result.weightedScore, 6.5)
    assert.equal(result.estimatedScore, 46.2)
    assert.equal(result.correct, 5)
    assert.equal(result.wrong, 50)
  }
})
test('written answers wait for self assessment, but blank written work always gets zero', () => {
  const responses = completeResponses()
  assert.equal(scorePaper(paper, responses).pendingWeight, 30)
  assert.equal(scorePaper(paper, responses).estimatedScore, 497)
  assert.equal(scorePaper(paper, responses, { writing: 12, translation: 9 }).estimatedScore, 646.1)
  assert.equal(scorePaper(paper, responses, { writing: 16, translation: -1 }).pendingWeight, 30)
  assert.equal(scorePaper(paper, {}, { writing: 15, translation: 15 }).estimatedScore, 0)
  for (const invalid of ['', ' ', null, undefined, true, 'bad', -1, 16, Infinity]) assert.equal(validSelfScore(invalid), false)
})
test('missing keys are pending for answered questions; blank questions remain zero even with missing keys', () => {
  const missing = structuredClone(paper)
  delete missing.solutions.items['46']
  const answered = { reading: { 46: 'A' } }
  const result = scorePaper(missing, answered)
  assert.equal(result.missingAnswers, 1)
  assert.equal(result.pendingWeight, 2)
  assert.equal(result.possibleScore, 14.2)
  assert.equal(result.wrong, 54)
  assert.equal(scorePaper(missing).pendingWeight, 0)
  missing.Listening.availability = 'source_omitted'
  const omitted = scorePaper(missing)
  assert.equal(omitted.missingQuestions, 25)
  assert.equal(omitted.pendingWeight, 35)
  assert.equal(omitted.wrong, 30)
})
test('score snapshots are independent of later answers and self assessments are reused only for unchanged drafts', () => {
  const responses = completeResponses(), self = { writing: 12, translation: 9 }
  const record = makeScoreRecord(paper, responses, self, 1000)
  assert.deepEqual(reusableSelfScores(record, responses), self)
  responses.writing['writing-0'] = 'Changed draft.'
  responses.reading['46'] = 'Z'
  self.writing = 15
  assert.deepEqual(reusableSelfScores(record, responses), { translation: 9 })
  assert.equal(record.summary.estimatedScore, 646.1)
  assert.equal(record.selfScores.writing, 12)
  assert.equal(record.responses.reading['46'], paper.solutions.items['46'].answer)
})
test('score storage keeps multiple immutable records without adding scores to progress or losing old data on failure', () => {
  const storage = memoryStorage()
  const first = makeScoreRecord(paper, {}, {}, 1000), second = makeScoreRecord(paper, completeResponses(), {}, 2000)
  saveScore(first, storage); saveScore(second, storage); saveScore(first, storage)
  assert.deepEqual(readScores(paper.id, storage).map(record => record.id), [second.id, first.id])
  assert.equal(allScores(storage).length, 2)
  assert.deepEqual(allProgress(storage), [])
  assert.throws(() => saveScore(makeScoreRecord(paper, {}, {}, 3000), { ...storage, setStorageSync() { throw new Error('full') } }), /full/)
  assert.equal(readScores(paper.id, storage).length, 2)
  const damaged = { ...storage, getStorageSync() { return [{ ...first, summary: {} }] } }
  assert.throws(() => saveScore(second, damaged), /评分记录读取失败/)
  assert.equal(readScores(paper.id, storage).length, 2)
})
test('history migrates existing practice, excludes mere opens, retains cleared attempted papers and includes blank graded papers', () => {
  const other = { ...paper, id: 'CET4-2025-06-1', level: 'CET4' }
  const records = [{ paperId: paper.id, sectionId: 'reading', answered: 2, updatedAt: 300 }, { paperId: paper.id, sectionId: 'cloze', answered: 1, updatedAt: 400 }, { paperId: other.id, sectionId: 'reading', answered: 0, updatedAt: 1000 }]
  const metadata = [paper, other]
  const before = groupPracticeHistory(records, [], metadata)
  assert.equal(before.length, 1); assert.equal(before[0].answered, 3); assert.equal(before[0].sectionId, 'cloze')
  const cleared = [{ ...records[0], answered: 0, startedAt: 200 }]
  assert.equal(groupPracticeHistory(cleared, [], metadata).length, 1)
  const after = groupPracticeHistory(records, [makeScoreRecord(other, {}, {}, 2000)], metadata)
  assert.equal(after.length, 2); assert.equal(after[0].paper.id, other.id)
  const restored = paperResponses(paper, [{ paperId: paper.id, sectionId: 'reading', answers: { 46: 'Z', 47: 'A', 99: 'B' } }])
  assert.deepEqual(restored.reading, { 47: 'A' })
})

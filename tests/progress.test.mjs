import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSections, countAnswered, restoreProgress, listeningGroups, clozePassageChunks, nextAvailableSection, previousAvailableSection } from '../src/utils/paper.mjs'
import { saveProgress, readProgress, allProgress } from '../src/utils/storage.js'

const paper = JSON.parse(readFileSync(new URL('../src/static/papers/CET4-2025-06-1.json', import.meta.url), 'utf8'))
const sections = buildSections(paper)
function memoryStorage() {
  const map = new Map()
  return {
    getStorageSync: key => map.has(key) ? JSON.parse(map.get(key)) : '',
    setStorageSync: (key, value) => map.set(key, JSON.stringify(value)),
    getStorageInfoSync: () => ({ keys: [...map.keys()] }),
  }
}
test('real sample covers six question types and preserves source options', () => {
  assert.deepEqual(sections.map(s => s.items.length), [10, 10, 10, 25, 1, 1])
  const reading = sections.find(s => s.id === 'reading')
  assert.deepEqual(reading.items[0].options, paper.Reading.passage_comprehension.passages[0].questions[0].options)
  assert.equal(reading.items[0].number, 46)
  assert.equal(sections.find(s => s.id === 'listening').items[0].stem, null)
})
test('choice and writing survive reloading; question types and papers stay isolated', () => {
  const storage = memoryStorage()
  saveProgress({ paperId: paper.id, sectionId: 'reading', currentIndex: 4, answers: { 46: 'C', 48: 'A' } }, storage)
  saveProgress({ paperId: paper.id, sectionId: 'writing', currentIndex: 0, answers: { 'writing-0': 'A complete draft.\n第二行。' } }, storage)
  const restored = restoreProgress(sections[2], readProgress(paper.id, 'reading', storage))
  assert.equal(restored.currentIndex, 4)
  assert.deepEqual(restored.answers, { 46: 'C', 48: 'A' })
  assert.equal(countAnswered(sections[2].items, restored.answers), 2)
  assert.equal(readProgress(paper.id, 'writing', storage).answers['writing-0'], 'A complete draft.\n第二行。')
  assert.equal(readProgress('CET6-2025-06-1', 'reading', storage), null)
  assert.equal(allProgress(storage).length, 2)
})
test('stale records cannot restore missing questions, invalid answers or bad position', () => {
  const restored = restoreProgress(sections[2], { currentIndex: 999, answers: { 46: 'Z', 47: 'A', 99: 'D' } })
  assert.equal(restored.currentIndex, 9)
  assert.deepEqual(restored.answers, { 47: 'A' })
  assert.equal(restoreProgress(sections[2], { currentIndex: -10 }).currentIndex, 0)
  assert.equal(countAnswered(sections[4].items, { 'writing-0': ' \n ' }), 0)
})
test('missing or unparsed data is never presented as usable questions', () => {
  const incomplete = structuredClone(paper)
  incomplete.Reading.paragraph_matching.availability = 'unparsed'
  incomplete.Listening.availability = 'source_omitted'
  const adapted = buildSections(incomplete)
  assert.equal(adapted.find(s => s.id === 'matching').items.length, 0)
  assert.equal(adapted.find(s => s.id === 'listening').items.length, 0)
})
test('storage failures propagate instead of reporting a successful save', () => {
  assert.throws(() => saveProgress({ paperId: paper.id, sectionId: 'reading' }, {
    setStorageSync() { throw new Error('Storage is full') },
  }), /Storage is full/)
})

test('listening groups preserve the source recording groups and old flat question progress', () => {
  const listening = sections.find(section => section.id === 'listening')
  const groups = listeningGroups(listening)
  assert.deepEqual(groups.map(group => group.items.map(item => item.number)), [[1, 2], [3, 4], [5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], [16, 17, 18], [19, 20, 21], [22, 23, 24, 25]])
  const restored = restoreProgress(listening, { currentIndex: 9, answers: { 1: 'B', 10: 'A' } })
  assert.equal(groups.find(group => group.items.some(item => item.key === listening.items[restored.currentIndex].key)).startIndex, 7)
  assert.deepEqual(restored.answers, { 1: 'B', 10: 'A' })
})

test('inline cloze blanks use parser offsets and leave ordinary repeated numbers untouched', () => {
  const repeated = JSON.parse(readFileSync(new URL('../src/static/papers/CET6-2025-12-1.json', import.meta.url), 'utf8'))
  const cloze = buildSections(repeated)[0]
  const chunks = clozePassageChunks(cloze)
  assert.equal(chunks.filter(chunk => chunk.item).length, 10)
  assert.ok(chunks.some(chunk => chunk.text?.includes('32% to 35%')))
  assert.equal(chunks.map(chunk => chunk.item?.blank || chunk.text).join(''), cloze.items[0].passage)
})

test('next type follows the visible order and skips missing types without making empty attempts', () => {
  assert.equal(nextAvailableSection(sections, 'cloze').id, 'matching')
  assert.equal(nextAvailableSection(sections, 'writing').id, 'translation')
  assert.equal(nextAvailableSection(sections, 'translation'), null)
  const missing = sections.map(section => section.id === 'listening' ? { ...section, items: [] } : section)
  assert.equal(nextAvailableSection(missing, 'reading').id, 'writing')
  assert.equal(previousAvailableSection(sections, 'reading').id, 'matching')
  assert.equal(previousAvailableSection(sections, 'matching').id, 'cloze')
  assert.equal(previousAvailableSection(sections, 'cloze'), null)
  assert.equal(previousAvailableSection(missing, 'writing').id, 'reading')
})

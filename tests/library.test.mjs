import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSections, missingSectionMessage, clozePassageChunks, listeningGroups } from '../src/utils/paper.mjs'

const catalog = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'))
const load = id => JSON.parse(readFileSync(new URL(`../src/static/papers/${id}.json`, import.meta.url), 'utf8'))

test('all 119 built-in papers are loadable and have stable, unique identities', () => {
  assert.equal(catalog.length, 119)
  assert.equal(catalog.filter(p => p.level === 'CET4').length, 64)
  assert.equal(catalog.filter(p => p.level === 'CET6').length, 55)
  assert.equal(new Set(catalog.map(p => p.id)).size, 119)
  const missing = {}
  for (const metadata of catalog) {
    const paper = load(metadata.id)
    for (const [key, value] of Object.entries(metadata)) assert.equal(paper[key], value)
    for (const section of buildSections(paper)) {
      if (!section.items.length) { missing[section.id] = (missing[section.id] || 0) + 1; continue }
      assert.equal(new Set(section.items.map(item => item.key)).size, section.items.length, `${paper.id}/${section.id}`)
      const expected = { listening: 25, cloze: 10, matching: 10, reading: 10, writing: 1, translation: 1 }
      assert.equal(section.items.length, expected[section.id], `${paper.id}/${section.id}`)
      if (section.id === 'cloze') {
        const chunks = clozePassageChunks(section)
        assert.equal(chunks.filter(chunk => chunk.item).length, 10, paper.id)
        assert.equal(chunks.map(chunk => chunk.item?.blank || chunk.text).join(''), section.items[0].passage, paper.id)
      }
      if (section.id === 'listening') assert.deepEqual(listeningGroups(section).flatMap(group => group.items.map(item => item.key)), section.items.map(item => item.key))
    }
  }
  assert.deepEqual(missing, { listening: 33, cloze: 3, matching: 3, reading: 3, writing: 1 })
})

test('real omissions keep other question types usable and provide the correct message', () => {
  const omitted = buildSections(load('CET4-2022-06-3'))
  for (const id of ['listening', 'cloze', 'matching', 'reading']) assert.equal(omitted.find(s => s.id === id).items.length, 0)
  assert.equal(omitted.find(s => s.id === 'writing').items.length, 1)
  assert.equal(omitted.find(s => s.id === 'translation').items.length, 1)
  const writing = buildSections(load('CET6-2019-12-2')).find(s => s.id === 'writing')
  assert.equal(writing.items.length, 0)
  assert.equal(missingSectionMessage(writing), '本套真题缺少写作题目，请选择其他题型。')
  const noListening = buildSections(load('CET4-2022-12-3')).find(s => s.id === 'listening')
  assert.equal(noListening.items.length, 0)
})

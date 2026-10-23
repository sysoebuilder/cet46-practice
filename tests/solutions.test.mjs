import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSections } from '../src/utils/paper.mjs'
import { answerReview } from '../src/utils/solutions.mjs'

const paper = JSON.parse(readFileSync(new URL('../src/static/papers/CET6-2017-06-2.json', import.meta.url), 'utf8'))
const item = buildSections(paper).find(s => s.id === 'reading').items.find(item => paper.solutions.items[item.key])

test('solutions grade by the original question letter and use its exact option text', () => {
  assert.ok(item)
  const key = paper.solutions.items[item.key]
  const originalText = item.options.find(option => option.label === key.answer).text
  assert.equal(answerReview(paper, 'reading', item, key.answer).status, 'correct')
  assert.equal(answerReview(paper, 'reading', item, key.answer).answerText, originalText)
  const other = item.options.find(option => option.label !== key.answer).label
  assert.equal(answerReview(paper, 'reading', item, other).status, 'incorrect')
  assert.equal(answerReview(paper, 'reading', item, '').status, 'unanswered')
})
test('absent or invalid keys cannot mark a response wrong', () => {
  assert.equal(answerReview({}, 'reading', item, 'A').status, 'missing')
  assert.equal(answerReview({ solutions: { items: { [item.key]: { answer: 'Z' } } } }, 'reading', item, 'A').status, 'missing')
})
test('writing and translation show references without objective grading', () => {
  const writing = buildSections(paper).find(s => s.id === 'writing').items[0]
  const result = answerReview(paper, 'writing', writing, 'My saved draft')
  assert.equal(result.status, 'reference')
  assert.deepEqual(result.references, [])
  const reference = { kind: 'writing', text: 'Reference fixture' }
  const withReference = { solutions: { references: { writing: [reference] } } }
  assert.deepEqual(answerReview(withReference, 'writing', writing, '').references, [reference])
})

test('all existing answer origins use the same response comparison without source labels', () => {
  for (const origin of ['answer_pdf', 'external_reference', 'question_inference', 'audio_model']) {
    const referencePaper = { solutions: { ...paper.solutions, origin } }
    const answer = paper.solutions.items[item.key].answer
    const other = item.options.find(option => option.label !== answer).label
    for (const [response, status] of [['', 'unanswered'], [answer, 'correct'], [other, 'incorrect']]) {
      const review = answerReview(referencePaper, 'reading', item, response)
      assert.equal(review.status, status)
      assert.equal(review.answer, answer)
      assert.equal(review.note, undefined)
    }
  }
})


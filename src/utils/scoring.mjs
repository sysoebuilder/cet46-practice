import { buildSections, restoreProgress } from './paper.mjs'

// Official question weights; linear /710 results are practice estimates, not norm-referenced CET reports.
export const SCORING_VERSION = 'cet-weights-2016-v1'
export const SCORE_SOURCES = [
  { title: '官方分数解释', url: 'https://cet.neea.edu.cn/xhtml1/folder/19081/5124-1.htm' },
  { title: '官方四级笔试结构', url: 'https://www.neea.edu.cn/html1/report/16123/196-1.htm' },
  { title: '官方六级笔试结构', url: 'https://www.neea.edu.cn/html1/report/16123/201-1.htm' },
  { title: '教育部中国大学生在线：题型与评分档次', url: 'https://dxs.moe.gov.cn/zx/a/kskt_yy/210601/1693612.shtml' },
]
const DEFINITIONS = [
  { id: 'listening', name: '听力理解', start: 1, total: 25, weight: 35 },
  { id: 'cloze', name: '选词填空', start: 26, total: 10, weight: 5 },
  { id: 'matching', name: '长篇阅读', start: 36, total: 10, weight: 10 },
  { id: 'reading', name: '仔细阅读', start: 46, total: 10, weight: 20 },
  { id: 'writing', name: '写作', total: 1, weight: 15 },
  { id: 'translation', name: '翻译', total: 1, weight: 15 },
]
const round = number => Math.round(number * 100) / 100
export const estimate710 = weight => Math.round(weight * 71) / 10
export function validSelfScore(value) { return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 15 }
export function paperResponses(paper, progress) {
  return Object.fromEntries(buildSections(paper).map(section => [section.id,
    restoreProgress(section, progress.find(record => record.paperId === paper.id && record.sectionId === section.id)).answers]))
}
export function scorePaper(paper, responses = {}, selfScores = {}) {
  const adapted = buildSections(paper)
  const sections = DEFINITIONS.map(def => {
    const actual = adapted.find(section => section.id === def.id)
    const questions = []
    for (let index = 0; index < def.total; index++) {
      const number = def.start ? def.start + index : index + 1
      const key = def.start ? String(number) : `${def.id}-${index}`
      const item = actual.items.find(item => item.key === key)
      const weight = def.id === 'listening' ? (number <= 15 ? 1 : 2) : def.weight / def.total
      const response = responses[def.id]?.[key]
      const solution = paper.solutions?.items?.[key]
      let status, points = 0, answer = null
      if (!item) status = 'question_missing'
      else if (item.kind === 'text') {
        if (typeof response !== 'string' || !response.trim()) status = 'blank'
        else if (validSelfScore(selfScores[def.id])) { status = 'self'; points = Number(selfScores[def.id]) }
        else status = 'pending'
      } else {
        answer = item.options.some(option => option.label === solution?.answer) ? solution.answer : null
        if (!item.options.some(option => option.label === response)) status = 'blank'
        else if (!answer) status = 'answer_missing'
        else if (response === answer) { status = 'correct'; points = weight }
        else status = 'incorrect'
      }
      questions.push({ key, number, response: typeof response === 'string' ? response : '', answer, status, points, weight })
    }
    const count = status => questions.filter(question => question.status === status).length
    const pendingWeight = round(questions.filter(question => ['question_missing', 'answer_missing', 'pending'].includes(question.status)).reduce((sum, question) => sum + question.weight, 0))
    const score = round(questions.reduce((sum, question) => sum + question.points, 0))
    return { ...def, questions, score, estimated: estimate710(score), maximum: estimate710(def.weight), pendingWeight,
      correct: count('correct'), wrong: count('incorrect') + count('blank'), blank: count('blank'),
      pending: count('pending'), missingQuestions: count('question_missing'), missingAnswers: count('answer_missing'),
      answered: questions.filter(question => !['blank', 'question_missing'].includes(question.status)).length }
  })
  const objective = sections.filter(section => section.start)
  const sum = (name, list = sections) => round(list.reduce((total, section) => total + section[name], 0))
  const weightedScore = sum('score'), pendingWeight = sum('pendingWeight')
  return { version: SCORING_VERSION, sections, weightedScore, estimatedScore: estimate710(weightedScore),
    possibleScore: estimate710(weightedScore + pendingWeight), pendingWeight, complete: pendingWeight === 0,
    correct: sum('correct', objective), wrong: sum('wrong', objective), blank: sum('blank', objective), answered: sum('answered'),
    missingQuestions: sum('missingQuestions'), missingAnswers: sum('missingAnswers') }
}

export function makeScoreRecord(paper, responses, selfScores, now = Date.now()) {
  return JSON.parse(JSON.stringify({ schemaVersion: 1, id: `${now}-${Math.random().toString(36).slice(2, 10)}`, paperId: paper.id,
    createdAt: now, responses, selfScores, summary: scorePaper(paper, responses, selfScores) }))
}
export function reusableSelfScores(record, responses) {
  const result = {}
  for (const id of ['writing', 'translation']) {
    if (record?.responses?.[id]?.[`${id}-0`] === responses[id]?.[`${id}-0`] && validSelfScore(record?.selfScores?.[id])) result[id] = record.selfScores[id]
  }
  return result
}

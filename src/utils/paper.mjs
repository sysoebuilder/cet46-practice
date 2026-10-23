export const SECTION_DEFS = [
  { id: 'cloze', name: '选词填空', english: 'Section A', mark: '词' },
  { id: 'matching', name: '长篇阅读', english: 'Section B', mark: '段' },
  { id: 'reading', name: '仔细阅读', english: 'Section C', mark: '读' },
  { id: 'listening', name: '听力理解', english: 'Listening', mark: '听' },
  { id: 'writing', name: '写作', english: 'Writing', mark: '写' },
  { id: 'translation', name: '翻译', english: 'Translation', mark: '译' },
]
const available = value => value && value.availability === 'available'
const directions = value => value?.instructions?.directions || ''

// Preserve question numbers, wording and option order from the Pydantic output.
export function buildSections(paper) {
  const result = Object.fromEntries(SECTION_DEFS.map(def => [def.id, { ...def, items: [] }]))
  const reading = paper.Reading
  if (available(reading)) {
    const cloze = reading.word_bank_cloze
    if (available(cloze)) result.cloze.items = cloze.questions.map(question => ({
      key: String(question.number), number: question.number, stem: '',
      options: cloze.word_bank, passage: cloze.passage, directions: directions(cloze), blank: question.marker,
      blankStart: question.start, blankEnd: question.end,
    }))
    const matching = reading.paragraph_matching
    if (available(matching)) result.matching.items = matching.questions.map(question => ({
      key: String(question.number), number: question.number, stem: question.statement,
      options: matching.paragraphs.map(p => ({ label: p.label, text: '' })),
      paragraphs: matching.paragraphs, title: matching.title, directions: directions(matching),
    }))
    const comprehension = reading.passage_comprehension
    if (available(comprehension)) result.reading.items = comprehension.passages.flatMap(passage => passage.questions.map(question => ({
      ...question, key: String(question.number), passage: passage.passage,
      title: `Passage ${passage.ordinal}`, directions: directions(comprehension),
    })))
  }
  if (available(paper.Listening)) result.listening.items = paper.Listening.sections.filter(available).flatMap(section =>
    section.groups.flatMap((group, groupIndex) => group.questions.map(question => ({
      ...question, key: String(question.number), passage: group.transcript || '',
      groupKey: `${section.section}-${groupIndex}`,
      title: `Section ${section.section}`, leadIn: group.lead_in, directions: directions(section),
    }))))
  for (const [id, source] of [['writing', paper.Writing], ['translation', paper.Translation]]) {
    if (!available(source)) continue
    result[id].items = source.tasks.map((task, i) => ({
      key: `${id}-${i}`, number: i + 1, kind: 'text',
      passage: id === 'writing' ? task.prompt : task.source_text,
      materials: task.materials || '', directions: directions(task), wordLimit: task.word_limit,
    }))
  }
  return SECTION_DEFS.map(def => result[def.id])
}
export function paperTitle(paper) { return `${paper.year}年${paper.month}月 · 第${paper.set_number}套` }
export function listeningGroups(section) {
  const groups = []
  for (const [index, item] of (section?.items || []).entries()) {
    let group = groups[groups.length - 1]
    if (!group || group.key !== item.groupKey) {
      group = { key: item.groupKey, startIndex: index, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}
export function clozePassageChunks(section) {
  // Parser offsets are Unicode code points, not JS UTF-16 offsets.
  const passage = Array.from(section?.items[0]?.passage || '')
  const chunks = []
  let cursor = 0
  for (const [index, item] of (section?.items || []).entries()) {
    if (!Number.isInteger(item.blankStart) || item.blankStart < cursor || passage.slice(item.blankStart, item.blankEnd).join('') !== item.blank) continue
    chunks.push({ text: passage.slice(cursor, item.blankStart).join('') }, { item, index })
    cursor = item.blankEnd
  }
  chunks.push({ text: passage.slice(cursor).join('') })
  return chunks
}
export function nextAvailableSection(sections, currentId) {
  return sections.slice(sections.findIndex(section => section.id === currentId) + 1).find(section => section.items.length) || null
}
export function previousAvailableSection(sections, currentId) {
  return sections.slice(0, sections.findIndex(section => section.id === currentId)).reverse().find(section => section.items.length) || null
}
export function missingSectionMessage(section) { return `本套真题缺少${section.name}题目，请选择其他题型。` }
export function countAnswered(items, answers = {}) {
  return items.filter(item => {
    const answer = answers[item.key]
    if (typeof answer !== 'string' || !answer.trim()) return false
    return item.kind === 'text' || item.options.some(option => option.label === answer)
  }).length
}
export function restoreProgress(section, saved) {
  const answers = {}
  for (const item of section.items) {
    const answer = saved?.answers?.[item.key]
    if (typeof answer === 'string' && (item.kind === 'text' || item.options.some(o => o.label === answer))) answers[item.key] = answer
  }
  return { answers, currentIndex: Math.max(0, Math.min(Number.isInteger(saved?.currentIndex) ? saved.currentIndex : 0, section.items.length - 1)) }
}

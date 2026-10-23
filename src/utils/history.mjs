export function groupPracticeHistory(progress, scores, catalog) {
  const groups = new Map()
  function get(id) {
    const paper = catalog.find(paper => paper.id === id)
    if (!paper) return null
    if (!groups.has(id)) groups.set(id, { paper, answered: 0, updatedAt: 0, sectionId: '', latestScore: null })
    return groups.get(id)
  }
  for (const record of progress) {
    if (!(record.startedAt > 0 || record.answered > 0)) continue
    const group = get(record.paperId)
    if (!group) continue
    group.answered += Number(record.answered) || 0
    if (record.updatedAt >= group.updatedAt) { group.updatedAt = record.updatedAt; group.sectionId = record.sectionId }
  }
  for (const record of scores) {
    const group = get(record.paperId)
    if (!group) continue
    if (!group.latestScore || group.latestScore.createdAt < record.createdAt) group.latestScore = record
    group.updatedAt = Math.max(group.updatedAt, record.createdAt)
  }
  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}
export function historyTime(value) {
  const date = new Date(value), pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const PREFIX = 'cet:progress:v1:'
const SCORES_PREFIX = 'cet:scores:v1:'
export function progressKey(paperId, sectionId) { return `${PREFIX}${paperId}:${sectionId}` }
export function readProgress(paperId, sectionId, storage = uni) {
  const value = storage.getStorageSync(progressKey(paperId, sectionId))
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}
export function saveProgress(record, storage = uni) {
  const value = { ...record, updatedAt: Date.now() }
  storage.setStorageSync(progressKey(record.paperId, record.sectionId), value)
  return value
}
export function allProgress(storage = uni) {
  return storage.getStorageInfoSync().keys.filter(key => key.startsWith(PREFIX)).map(key => storage.getStorageSync(key))
    .filter(record => record && typeof record === 'object' && record.paperId && record.sectionId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
export function readScores(paperId, storage = uni) {
  const value = storage.getStorageSync(`${SCORES_PREFIX}${paperId}`)
  if (!value) return []
  if (!Array.isArray(value) || value.some(record => record?.schemaVersion !== 1 || record.paperId !== paperId || !record.responses || !Number.isFinite(record.createdAt) || !Number.isFinite(record.summary?.estimatedScore) || !Array.isArray(record.summary?.sections))) throw new Error('评分记录读取失败')
  return value
}
export function allScores(storage = uni) {
  return storage.getStorageInfoSync().keys.filter(key => key.startsWith(SCORES_PREFIX))
    .flatMap(key => readScores(key.slice(SCORES_PREFIX.length), storage)).sort((a, b) => b.createdAt - a.createdAt)
}
export function saveScore(record, storage = uni) {
  const records = readScores(record.paperId, storage)
  if (records.some(saved => saved.id === record.id)) return record
  storage.setStorageSync(`${SCORES_PREFIX}${record.paperId}`, [record, ...records])
  return record
}
export function loadPaper(id) {
  if (!/^CET[46]-\d{4}-\d{2}-[123]$/.test(id)) return Promise.reject(new Error('无效的试卷'))
  const url = `/static/papers/${id}.json`
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(`_www${url}`, entry => {
      entry.file(file => {
        const reader = new plus.io.FileReader()
        reader.onloadend = event => {
          try { resolve(JSON.parse(event.target.result)) } catch (error) { reject(error) }
        }
        reader.onerror = reject
        reader.readAsText(file, 'utf-8')
      }, reject)
    }, reject)
  })
  // #endif
  // #ifndef APP-PLUS
  return new Promise((resolve, reject) => {
    uni.request({ url, success(response) {
      if (response.statusCode !== 200) return reject(new Error('试卷读取失败'))
      try { resolve(typeof response.data === 'string' ? JSON.parse(response.data) : response.data) }
      catch (error) { reject(error) }
    }, fail: reject })
  })
  // #endif
}

import { nativeRuntime, getAppStorage, setAppStorage, getAppStorageInfo } from './native-runtime.js'
import { readBundledPaper } from './bundled-paper.js'
const PREFIX = 'cet:progress:v1:'
const defaultStorage = {
  getStorageSync: getAppStorage,
  setStorageSync: setAppStorage,
  getStorageInfoSync: getAppStorageInfo,
}
export function progressKey(paperId, sectionId) { return `${PREFIX}${paperId}:${sectionId}` }
export function readProgress(paperId, sectionId, storage = defaultStorage) {
  const value = storage.getStorageSync(progressKey(paperId, sectionId))
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}
export function saveProgress(record, storage = defaultStorage) {
  const value = { ...record, updatedAt: Date.now() }
  storage.setStorageSync(progressKey(record.paperId, record.sectionId), value)
  return value
}
export function allProgress(storage = defaultStorage) {
  return storage.getStorageInfoSync().keys.filter(key => key.startsWith(PREFIX)).map(key => storage.getStorageSync(key))
    .filter(record => record && typeof record === 'object' && record.paperId && record.sectionId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
export function loadPaper(id) {
  if (!/^CET[46]-\d{4}-\d{2}-[123]$/.test(id)) return Promise.reject(new Error('无效的试卷'))
  const url = `/static/papers/${id}.json`
  if (nativeRuntime()) return readBundledPaper(id)
  return fetch(url).then(response => {
    if (!response.ok) throw new Error('试卷读取失败')
    return response.json()
  })
}

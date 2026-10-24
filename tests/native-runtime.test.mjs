import test from 'node:test'
import assert from 'node:assert/strict'
import { getAppStorage, setAppStorage, getAppStorageInfo, bundledResource } from '../src/utils/native-runtime.js'

test('local App UI reads existing native uni storage envelopes and preserves keys', () => {
  const data = new Map([['cet:level', 'CET4'], ['cet:font', '{"type":"number","data":21}'], ['cet:progress:v1:test', '{"type":"object","data":{"answers":{"26":"A"}}}']])
  globalThis.__CET_LOCAL_APP__ = true
  globalThis.plus = { storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), getLength: () => data.size, key: index => [...data.keys()][index] }, io: { convertLocalFileSystemURL: path => `file:///app/${path.slice(5)}` } }
  try {
    assert.equal(getAppStorage('cet:level'), 'CET4')
    assert.equal(getAppStorage('cet:font'), 21)
    assert.deepEqual(getAppStorage('cet:progress:v1:test'), { answers: { 26: 'A' } })
    setAppStorage('cet:progress:v1:test', { answers: { 26: 'B' } })
    assert.deepEqual(JSON.parse(data.get('cet:progress:v1:test')), { type: 'object', data: { answers: { 26: 'B' } } })
    assert.equal(getAppStorageInfo().keys.length, 3)
    assert.equal(bundledResource('/static/audio/test.mp3'), 'file:///app/static/audio/test.mp3')
    assert.throws(() => bundledResource('/static/../secret'))
  } finally { delete globalThis.plus; delete globalThis.__CET_LOCAL_APP__ }
})

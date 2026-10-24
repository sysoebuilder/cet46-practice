import test from 'node:test'
import assert from 'node:assert/strict'
import { readBundledPaper } from '../src/utils/bundled-paper.js'

test('APK paper transport shares concurrent reads, validates identity, cleans up and retries', async () => {
  const scripts = []
  globalThis.__CET_RESOURCE_ROOT__ = 'file:///android_asset/apps/test/www/'
  globalThis.document = {
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({ remove() { this.removed = true } }),
  }
  const id = 'CET4-2025-12-1'
  const paper = { level: 'CET4', year: 2025, month: 12, set_number: 1, Writing: { tasks: [] } }
  try {
    await assert.rejects(readBundledPaper('../outside'), /无效/)
    assert.equal(scripts.length, 0)
    const first = readBundledPaper(id)
    assert.equal(readBundledPaper(id), first)
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].src, `file:///android_asset/apps/test/www/static/papers/${id}.js`)
    scripts[0].onerror()
    await assert.rejects(first, /加载失败/)
    assert.equal(scripts[0].removed, true)

    const second = readBundledPaper(id)
    scripts[1].__cetPaper = { ...paper, level: 'CET6' }
    scripts[1].onload()
    await assert.rejects(second, /资源异常/)
    assert.equal(scripts[1].__cetPaper, undefined)

    const third = readBundledPaper(id)
    scripts[2].__cetPaper = paper
    scripts[2].onload()
    assert.equal(await third, paper)
    assert.equal(scripts[2].removed, true)
    assert.equal(scripts[2].onload, null)
  } finally {
    delete globalThis.document
    delete globalThis.__CET_RESOURCE_ROOT__
  }
})

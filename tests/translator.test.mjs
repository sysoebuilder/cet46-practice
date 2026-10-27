import test from 'node:test'
import assert from 'node:assert/strict'
import { createTranslator } from '../src/translation/translator.mjs'
import { wordAt, sentenceAt } from '../src/translation/text-selection.mjs'

function harness() {
  const calls = [], pending = [], bridge = {}
  const engine = createTranslator({ timeout: 1000, getRuntime: () => ({
    os: { name: 'Android' }, android: {
      importClass: name => name, runtimeMainActivity: () => ({}), implements: (_, callback) => callback,
      invoke: (object, method, ...args) => {
        if (method === 'getInstance') {
          assert.equal(object, 'com.hexun.cet.foxlet.FoxletBridge', 'Static Native.js invoke must use a class name, not a JS function proxy')
          return bridge
        }
        calls.push({ method, args }); pending.push({ method, args })
      },
    },
  }) })
  function complete(method, value = '', code) {
    const index = pending.findIndex(call => call.method === method)
    assert.ok(index >= 0, `waiting for ${method}`)
    const { args } = pending.splice(index, 1)[0], callback = args.at(-1), id = args.at(-2)
    if (code) callback.onError(id, code, value); else callback.onSuccess(id, value)
  }
  return { engine, calls, complete }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('concurrent initialization and identical inference coalesce, cache is case sensitive', async () => {
  const { engine, calls, complete } = harness()
  const a = engine.init(), b = engine.init()
  assert.equal(a, b); complete('init'); await a
  const first = engine.translate('Hello'), second = engine.translate('Hello')
  await tick(); assert.equal(calls.filter(c => c.method === 'translate').length, 1)
  complete('translate', '测试结果'); assert.deepEqual(await Promise.all([first, second]), ['测试结果', '测试结果'])
  assert.equal(await engine.translate('Hello'), '测试结果')
  const lower = engine.translate('hello'); await tick(); complete('translate', '另一个结果'); await lower
  assert.equal(calls.filter(c => c.method === 'init').length, 1)
  assert.equal(engine.isReady(), true)
})

test('native failures reject honestly and initialization can retry', async () => {
  const { engine, complete } = harness()
  const first = engine.init(); complete('init', '模型缺失', 'MODEL_MISSING')
  await assert.rejects(first, { code: 'MODEL_MISSING' }); assert.equal(engine.isReady(), false)
  const retry = engine.init(); complete('init'); await retry; assert.equal(engine.isReady(), true)
  const unsupported = createTranslator({ getRuntime: () => undefined })
  await assert.rejects(unsupported.translate('Hello'), { code: 'UNSUPPORTED_DEVICE' })
})

test('destroy rejects pending work and waits for native release before reinitializing', async () => {
  const { engine, complete, calls } = harness()
  const initialized = engine.init(); complete('init'); await initialized
  const running = engine.translate('Hello'); await tick()
  const rejected = assert.rejects(running, { code: 'DESTROYED' })
  const closing = engine.destroy(), reopening = engine.init()
  assert.equal(engine.getStatus().state, 'closing')
  complete('translate', 'late'); complete('destroy'); await closing; await rejected; await tick()
  assert.equal(calls.filter(c => c.method === 'init').length, 2)
  complete('init'); await reopening; assert.equal(engine.isReady(), true)
})

test('timeouts do not produce fabricated results; invalid input is rejected', async () => {
  const engine = createTranslator({ timeout: 10, getRuntime: () => ({ os: { name: 'Android' }, android: {
    importClass: () => ({}), runtimeMainActivity: () => ({}), invoke: () => ({}), implements: () => ({}),
  } }) })
  await assert.rejects(engine.init(), { code: 'TIMEOUT' })
  await assert.rejects(engine.translate(' '.repeat(5)), { code: 'TEXT_LIMIT' })
  await assert.rejects(engine.translate('a'.repeat(4001)), { code: 'TEXT_LIMIT' })
})

test('word recognition handles contractions, curly apostrophes, abbreviations and punctuation', () => {
  for (const [text, position, expected] of [['“Hello,”', 2, 'Hello'], ["don't", 3, "don't"], ['It’s', 2, 'It’s'], ['U.S.', 2, 'U.S.'], ['state-of-the-art', 6, 'state-of-the-art']]) assert.equal(wordAt(text, position)?.text, expected)
  assert.equal(wordAt('a  b', 2), null)
})

test('sentence shortcut preserves abbreviation and selected text boundaries', () => {
  const text = 'Dr. Smith lives in the U.S. today. He reads books!'
  assert.equal(sentenceAt(text, 5, 10).text, 'Dr. Smith lives in the U.S. today.')
  assert.equal(sentenceAt(text, 37, 42).text, 'He reads books!')
})

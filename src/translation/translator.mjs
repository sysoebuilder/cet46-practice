const CLASS = 'com.hexun.cet.foxlet.FoxletBridge'
const CALLBACK = 'com.hexun.cet.foxlet.FoxletCallback'
const failure = (code, message) => Object.assign(new Error(message), { code })

/** No framework, network, dictionary or fabricated fallback. One adapter per WebView. */
export function createTranslator({ getRuntime = () => globalThis.plus, timeout = 180000, cacheLimit = 256 } = {}) {
  let bridge, runtime, initialization, destruction, state = 'idle', error = '', epoch = 0, sequence = 0
  const cache = new Map(), flights = new Map(), callbacks = new Map()
  function connect() {
    if (bridge) return
    runtime = getRuntime()
    if (!runtime?.android || runtime.os?.name !== 'Android') throw failure('UNSUPPORTED_DEVICE', '离线翻译需要包含 Foxlet 的 Android 9+ ARM64 安装包')
    try {
      // Imported class proxies are JS functions in this 5+ runtime; passing one
      // to invoke silently returns null. A fully qualified class name is stable.
      bridge = runtime.android.invoke(CLASS, 'getInstance', runtime.android.runtimeMainActivity())
      if (!bridge) throw new Error('Missing bridge')
    } catch { throw failure('NATIVE_UNAVAILABLE', '此安装包未集成离线翻译，请安装包含 Foxlet 的专用版本') }
  }
  function call(method, args = []) {
    try { connect() } catch (e) { return Promise.reject(e) }
    return new Promise((resolve, reject) => {
      const id = `foxlet-${epoch}-${++sequence}`
      const finish = (e, value) => {
        const entry = callbacks.get(id)
        if (!entry) return
        clearTimeout(entry.timer); callbacks.delete(id)
        if (e) reject(e); else resolve(value)
      }
      const callback = runtime.android.implements(CALLBACK, {
        onSuccess: (requestId, value) => { if (String(requestId) === id) finish(null, String(value)) },
        onError: (requestId, code, message) => { if (String(requestId) === id) finish(failure(String(code), String(message))) },
      })
      // Retain Native.js callback proxies until completion (including bridge reload).
      callbacks.set(id, { callback, reject, timer: setTimeout(() => finish(failure('TIMEOUT', '离线翻译耗时较长，请稍后重试')), timeout) })
      try { runtime.android.invoke(bridge, method, ...args, id, callback) }
      catch { finish(failure('NATIVE_UNAVAILABLE', '原生翻译接口不可用，请检查安装包')) }
    })
  }
  function init() {
    if (destruction) return destruction.then(init)
    if (state === 'ready') return Promise.resolve()
    if (initialization) return initialization
    const version = epoch
    state = 'initializing'; error = ''
    const task = call('init').then(() => { if (version === epoch) state = 'ready' }).catch(e => {
      if (version === epoch) { state = 'error'; error = e.code }
      throw e
    }).finally(() => { if (initialization === task) initialization = null })
    initialization = task
    return task
  }
  async function translate(text) {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 4000) throw failure('TEXT_LIMIT', '请选择 1–4000 字符的英文文本')
    const input = text.trim(), version = epoch
    await init()
    if (version !== epoch) throw failure('DESTROYED', '翻译已释放，请重试')
    if (cache.has(input)) {
      const value = cache.get(input); cache.delete(input); cache.set(input, value)
      return value
    }
    if (flights.has(input)) return flights.get(input)
    const task = call('translate', [input]).then(result => {
      if (version !== epoch) throw failure('DESTROYED', '翻译已释放，请重试')
      cache.set(input, result)
      if (cache.size > cacheLimit) cache.delete(cache.keys().next().value)
      return result
    }).catch(e => {
      error = e.code
      if (['LOW_MEMORY', 'MODEL_CORRUPT', 'MODEL_MISSING', 'UNSUPPORTED_DEVICE'].includes(e.code)) state = 'error'
      throw e
    }).finally(() => { if (flights.get(input) === task) flights.delete(input) })
    flights.set(input, task)
    return task
  }
  function destroy() {
    if (destruction) return destruction
    epoch++; state = 'closing'; cache.clear(); flights.clear(); initialization = null
    for (const entry of callbacks.values()) { clearTimeout(entry.timer); entry.reject(failure('DESTROYED', '翻译已释放')) }
    callbacks.clear()
    const task = (bridge ? call('destroy') : Promise.resolve()).then(() => {
      state = 'idle'; error = ''
    }).catch(e => { state = 'error'; error = e.code; throw e }).finally(() => { destruction = null })
    destruction = task
    return task
  }
  function getStatus() {
    let native = null
    if (bridge) {
      try { native = JSON.parse(String(runtime.android.invoke(bridge, 'getStatus'))) } catch { /* JS status remains available. */ }
    }
    return { state, error, sdkVersion: '0.5.0', cached: cache.size, pending: flights.size, native }
  }
  return { init, translate, isReady: () => state === 'ready', getStatus, destroy }
}

export const translator = createTranslator()
export default translator

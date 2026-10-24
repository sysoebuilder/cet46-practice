// The same Vue app runs in a browser or directly in the 5+ launch WebView.
export function nativeRuntime() {
  return globalThis.__CET_LOCAL_APP__ === true ? globalThis.plus : null
}
export function getAppStorage(key) {
  const runtime = nativeRuntime()
  const storage = runtime?.storage || globalThis.localStorage
  const raw = storage.getItem(key)
  if (raw == null) return ''
  if (storage.getItem(`${key}__TYPE`) === 'string') return raw
  try {
    const value = JSON.parse(raw)
    if (value && Object.prototype.hasOwnProperty.call(value, 'data') && (value.type === typeof value.data || value.type === undefined)) return value.data
    return value
  } catch { return raw }
}
export function setAppStorage(key, data) {
  const runtime = nativeRuntime()
  const storage = runtime?.storage || globalThis.localStorage
  // Preserve the old progress/audio keys and typed envelopes during migration.
  const encoded = JSON.stringify({ type: typeof data, data })
  storage.setItem(key, encoded)
  if (storage.getItem(key) !== encoded) throw new Error('设备存储写入失败')
  storage.removeItem(`${key}__TYPE`)
}
export function getAppStorageInfo() {
  const runtime = nativeRuntime()
  const storage = runtime?.storage || globalThis.localStorage
  const keys = []
  for (let index = 0; index < (runtime ? storage.getLength() : storage.length); index++) {
    const key = storage.key(index)
    if (key && !key.endsWith('__TYPE')) keys.push(key)
  }
  return { keys }
}
export function bundledResource(path) {
  const runtime = nativeRuntime()
  if (!runtime || /^https?:\/\//.test(path)) return path
  if (!/^\/static\/[\w/.-]+$/.test(path) || path.includes('..')) throw new Error('无效的本地资源路径')
  return globalThis.__CET_RESOURCE_ROOT__ ? new URL(path.slice(1), globalThis.__CET_RESOURCE_ROOT__).href : runtime.io.convertLocalFileSystemURL(`_www${path}`)
}
export function readBundledJson(path) {
  const runtime = nativeRuntime()
  return new Promise((resolve, reject) => {
    runtime.io.resolveLocalFileSystemURL(bundledResource(path), entry => entry.file(file => {
      const reader = new runtime.io.FileReader()
      reader.onloadend = event => {
        try { resolve(JSON.parse(event.target.result)) } catch (error) { reject(error) }
      }
      reader.onerror = reject
      reader.readAsText(file, 'utf-8')
    }, reject), reject)
  })
}
export function bindNativeEvents({ back, hide, show }) {
  if (!nativeRuntime()) return () => {}
  const onBack = event => { event.detail.handled = true; back?.() }
  const onHide = () => hide?.(), onShow = () => show?.()
  window.addEventListener('cet:native-back', onBack)
  window.addEventListener('cet:native-hide', onHide)
  window.addEventListener('cet:native-show', onShow)
  return () => {
    window.removeEventListener('cet:native-back', onBack)
    window.removeEventListener('cet:native-hide', onHide)
    window.removeEventListener('cet:native-show', onShow)
  }
}
export function requestNativeExit() { globalThis.__CET_REQUEST_EXIT__?.() }

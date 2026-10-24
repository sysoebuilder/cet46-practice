/* Classic script entry: 5+ can load this directly from file://, without ESM CORS. */
(function () {
  var entry = document.currentScript.getAttribute('data-entry')
  var started = false, lastExit = 0
  function failure(message) { window.__CET_BOOT__.fail(message) }
  window.__CET_REQUEST_EXIT__ = function () {
    if (!window.plus) return
    if (lastExit && Date.now() - lastExit < 1800) plus.runtime.quit()
    else { lastExit = Date.now(); plus.nativeUI.toast('再按一次退出应用') }
  }
  window.__CET_NATIVE_BACK__ = function () {
    var detail = { handled: false }
    window.dispatchEvent(new CustomEvent('cet:native-back', { detail: detail }))
    if (!detail.handled) window.__CET_REQUEST_EXIT__()
  }
  function launch() {
    if (started) return
    if (location.protocol === 'file:' && !window.plus) return
    started = true
    window.__CET_LOCAL_APP__ = Boolean(window.plus)
    window.__CET_RESOURCE_ROOT__ = new URL('./', location.href).href
    if (window.plus) {
      plus.navigator.setStatusBarStyle('dark')
      plus.navigator.setStatusBarBackground('#f8faf9')
      plus.key.addEventListener('backbutton', window.__CET_NATIVE_BACK__)
      document.addEventListener('pause', function () { window.dispatchEvent(new Event('cet:native-hide')) })
      document.addEventListener('resume', function () { window.dispatchEvent(new Event('cet:native-show')) })
    }
    var main = document.createElement('script')
    main.src = entry
    main.onerror = function () { failure('未找到随包界面脚本') }
    document.body.appendChild(main)
  }
  document.addEventListener('plusready', launch)
  launch()
})()

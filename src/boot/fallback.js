/* Runs before Vue, in both HTTP and file:// startup. No animation dependency. */
(function () {
  var ready = false, failed = false, closedSplash = false
  var cover = document.getElementById('cet-boot-cover')
  var status = document.getElementById('cet-boot-status')
  var retry = document.getElementById('cet-boot-retry')
  var watchdog = setTimeout(function () { fail('准备时间较长，请重新加载。') }, 12000)
  function closeSplash() {
    if (closedSplash || !window.plus) return
    closedSplash = true
    plus.navigator.closeSplashscreen()
  }
  function fail(message) {
    if (ready) return
    failed = true; clearTimeout(watchdog)
    cover.hidden = false; cover.setAttribute('data-error', '')
    cover.setAttribute('role', 'alert')
    status.textContent = '暂时无法打开：' + String(message).slice(0, 180)
    retry.hidden = false
    document.getElementById('app').inert = true
    closeSplash()
  }
  retry.onclick = function () { location.reload() }
  window.__CET_BOOT__ = {
    fail: fail,
    mounted: function () {
      if (failed) return
      cover.hidden = true
      closeSplash()
      window.dispatchEvent(new Event('cet:ui-mounted'))
    },
    finish: function () {
      if (failed || ready) return
      ready = true; clearTimeout(watchdog); cover.remove()
      window.__CET_STARTUP_DONE__ = true
      window.dispatchEvent(new Event('cet:ready'))
    },
  }
  window.addEventListener('error', function (event) {
    if (event.message) fail(event.message)
    else if (event.target && event.target.tagName === 'SCRIPT') fail('页面资源未能加载，请重试。')
  }, true)
  window.addEventListener('unhandledrejection', function (event) { fail(event.reason && event.reason.message || event.reason) })
})()

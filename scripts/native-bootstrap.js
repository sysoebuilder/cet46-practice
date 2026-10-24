/* Classic script entry: 5+ can load this directly from file://, without ESM CORS. */
(function () {
  var entry = document.currentScript.getAttribute('data-entry')
  var started = false, ready = false, lastExit = 0
  var watchdog = setTimeout(function () { failure('运行环境未就绪，请重新运行 5+ App。') }, 12000)
  function closeSplash() { if (window.plus) plus.navigator.closeSplashscreen() }
  function failure(message) {
    if (ready) return
    clearTimeout(watchdog)
    var target = document.getElementById('cet-boot-status')
    if (target) {
      target.textContent = '界面启动失败：' + String(message).slice(0, 300) + ' '
      if (!target.querySelector('button')) {
        var retry = document.createElement('button')
        retry.textContent = '重新加载'; retry.onclick = function () { location.reload() }; target.appendChild(retry)
      }
    }
    closeSplash()
  }
  window.addEventListener('error', function (event) { failure(event.message || '本地脚本未能加载') })
  window.addEventListener('unhandledrejection', function (event) { failure(event.reason && event.reason.message || event.reason) })
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
    main.onload = function () {
      var attempts = 0
      function check() {
        if (document.querySelector('.home-inner, .practice-inner')) {
          ready = true; clearTimeout(watchdog)
          var status = document.getElementById('cet-boot-status')
          if (status) status.remove()
          closeSplash()
          window.dispatchEvent(new Event('cet:ready'))
        } else if (attempts++ < 150) setTimeout(check, 50)
        else failure('页面没有完成渲染')
      }
      check()
    }
    document.body.appendChild(main)
  }
  document.addEventListener('plusready', launch)
  launch()
})()

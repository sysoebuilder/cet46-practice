import translator from './translator.mjs'
import { wordFromPoint, rangeOffsets, sentenceAt, textRange } from './text-selection.mjs'

// All rendered exam copy, including teleported question/answer sheets. Controls
// and answer editors keep their own gestures; no per-word wrapper changes text.
const copy = ['.reading-text', '.directions', '.lead-in', '.passage-title', '.question-stem', '.question-passage-label', '.option-text', '.chosen-answer', '.blank-translation', '.cloze-correction', '.review-body', '.review-option-text', '.explanation-response', '.result-answer-copy', '.reference-material .review-label']
const selector = copy.flatMap(part => [`.practice ${part}`, `.utility-sheet ${part}`]).join(', ')
const interactive = 'button, a, input, textarea, [contenteditable="true"], .option-label, .blank-label, .correction-label, .paragraph-label'

/** Delegated listeners leave reading nodes, paragraph structure and selection untouched. */
export function installReadingTranslation({ engine = translator, root = document } = {}) {
  const card = document.createElement('aside')
  card.className = 'translation-card'
  card.setAttribute('aria-label', '离线翻译')
  card.setAttribute('role', 'region')
  card.hidden = true
  card.innerHTML = '<div class="translation-header"><span class="translation-caption">离线翻译 · 英 → 中</span><button type="button" class="translation-close" aria-label="关闭翻译">×</button></div><div class="translation-content"><p class="translation-source" lang="en"></p><div class="translation-result" lang="zh-CN" aria-live="polite" aria-atomic="true"></div></div><div class="translation-actions"><button type="button" data-action="translate">翻译选文</button><button type="button" data-action="sentence">选择整句</button><button type="button" data-action="copy" hidden>复制译文</button><button type="button" data-action="retry" hidden>重新翻译</button><button type="button" data-action="reselect">重新选择</button></div>'
  document.body.appendChild(card)
  const source = card.querySelector('.translation-source'), result = card.querySelector('.translation-result')
  const action = name => card.querySelector(`[data-action="${name}"]`)
  const listeners = []
  const feedback = new Set()
  const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); listeners.push(() => target.removeEventListener(type, handler, options)) }
  let request = 0, active, translated = '', pointer, blockedClick, suppressUntil = 0, selectionTimer, closeTimer, positionFrame, gestureTimer
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const readingElement = node => {
    const element = node?.nodeType === 1 ? node : node?.parentElement
    if (!element || element.closest(interactive) || element.closest('.translation-card')) return null
    return element.closest(selector)
  }
  const blockClick = element => { blockedClick = { element, until: Date.now() + 1000 } }

  function close() {
    request++; active = null; translated = ''; clearTimeout(selectionTimer)
    card.setAttribute('aria-busy', 'false')
    card.classList.remove('is-open')
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => { card.hidden = true }, reduced() ? 0 : 180)
  }
  function pulse(range) {
    for (const rect of [...range.getClientRects()].slice(0, 8)) {
      const glow = document.createElement('span')
      glow.className = 'translation-word-feedback'; glow.setAttribute('aria-hidden', 'true')
      Object.assign(glow.style, { left: `${rect.left - 2}px`, top: `${rect.top}px`, width: `${rect.width + 4}px`, height: `${rect.height}px` })
      document.body.appendChild(glow); feedback.add(glow)
      if (!reduced() && glow.animate) glow.animate([{ opacity: .5 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' })
      setTimeout(() => { glow.remove(); feedback.delete(glow) }, reduced() ? 100 : 430)
    }
  }
  function viewport() {
    const view = window.visualViewport
    return { left: view?.offsetLeft || 0, top: view?.offsetTop || 0, width: view?.width || innerWidth, height: view?.height || innerHeight }
  }
  function position() {
    if (!active || !active.element.isConnected) { close(); return }
    const view = viewport(), bounds = active.range.getBoundingClientRect()
    const visibleTop = Math.max(view.top + 16, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--status-bar-height')) || 0)
    const bottom = view.top + view.height - 20
    card.style.maxHeight = `${Math.max(80, bottom - visibleTop)}px`
    card.style.width = `${Math.min(354, view.width - 32)}px`
    const height = card.offsetHeight, width = card.offsetWidth
    const below = bottom - bounds.bottom - 14, above = bounds.top - visibleTop - 14
    // If neither side fits, make the card scroll within the larger free space.
    const useBelow = below >= height || (above < height && below >= above)
    const available = Math.max(0, useBelow ? below : above)
    if (available < 132) {
      // A viewport-filling selection leaves no free area; show a compact action
      // rail at its edge, then scroll the result beside the selection endpoint.
      card.classList.add('is-compact')
    } else card.classList.remove('is-compact')
    const actualHeight = Math.min(card.offsetHeight, Math.max(132, available), bottom - visibleTop)
    card.style.maxHeight = `${actualHeight}px`
    const left = Math.max(view.left + 16, Math.min(bounds.left + bounds.width / 2 - width / 2, view.left + view.width - width - 16))
    const top = Math.max(visibleTop, Math.min(useBelow ? bounds.bottom + 14 : bounds.top - actualHeight - 14, bottom - actualHeight))
    card.style.left = `${left}px`; card.style.top = `${top}px`
  }
  function schedulePosition() {
    cancelAnimationFrame(positionFrame)
    positionFrame = requestAnimationFrame(position)
  }
  function show(entry, mode) {
    clearTimeout(closeTimer)
    request++; translated = ''; active = { ...entry, mode }
    card.setAttribute('aria-busy', 'false')
    card.hidden = false
    card.classList.toggle('is-selection', mode === 'selection')
    card.classList.toggle('is-over-sheet', Boolean(entry.element.closest('.motion-sheet')))
    source.textContent = entry.text
    if (!reduced() && source.animate && card.classList.contains('is-open')) source.animate([{ opacity: .45, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 150, easing: 'ease-out' })
    result.textContent = mode === 'selection' ? '调整选区后，轻点「翻译选文」' : '正在离线翻译…'
    result.classList.remove('is-loading', 'is-error')
    action('translate').hidden = mode !== 'selection'
    action('sentence').hidden = mode !== 'selection'
    action('reselect').hidden = mode !== 'selection'
    action('copy').hidden = true; action('retry').hidden = true
    position()
    requestAnimationFrame(() => card.classList.add('is-open'))
    if (mode === 'word') infer()
  }
  async function infer() {
    if (!active) return
    const id = ++request, text = active.text
    result.classList.add('is-loading'); result.classList.remove('is-error')
    result.textContent = engine.isReady() ? '正在离线翻译…' : '正在准备离线模型…'
    action('translate').hidden = true; action('copy').hidden = true; action('retry').hidden = true
    card.setAttribute('aria-busy', 'true')
    schedulePosition()
    try {
      const value = await engine.translate(text)
      if (id !== request || !active) return
      translated = value; result.textContent = value
      result.classList.remove('is-loading')
      action('copy').hidden = false
      if (!reduced() && result.animate) result.animate([{ opacity: .35, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' })
    } catch (error) {
      if (id !== request || !active) return
      result.classList.remove('is-loading'); result.classList.add('is-error')
      result.textContent = error.message || '离线翻译未完成，请重试'
      action('retry').hidden = false
    } finally {
      if (id === request) { card.setAttribute('aria-busy', 'false'); schedulePosition() }
    }
  }
  function selectionChanged() {
    clearTimeout(selectionTimer)
    selectionTimer = setTimeout(() => {
      if (pointer) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) { if (active?.mode === 'selection') close(); return }
      const range = selection.getRangeAt(0), first = readingElement(range.startContainer), last = readingElement(range.endContainer)
      if (!first || !last) return
      const element = first === last ? first : first.closest('.question-entry, .listening-question, .material-scroll, .answer-review, .reference-material, .directions')
      if (!element || !element.contains(last) || !element.contains(range.commonAncestorContainer)) return
      const text = selection.toString().trim()
      if (!/[A-Za-z]/.test(text)) return
      suppressUntil = Date.now() + 700
      if (active?.mode === 'selection' && active.text === text) { schedulePosition(); return }
      show({ element, range: range.cloneRange(), text }, 'selection')
    }, 180)
  }
  on(root, 'pointerdown', event => {
    if (event.target?.nodeType && card.contains(event.target)) return
    // Suppress the end of a long press, not a new deliberate tap after the
    // user cleared selection or chose a letter elsewhere.
    if (window.getSelection()?.isCollapsed) suppressUntil = 0
    const element = readingElement(event.target)
    if (!element) { close(); return }
    pointer = { x: event.clientX, y: event.clientY, time: Date.now(), element, moved: false, word: wordFromPoint(element, event.clientX, event.clientY) }
    clearTimeout(gestureTimer)
    gestureTimer = setTimeout(() => { suppressUntil = Date.now() + 1000 }, 420)
  }, { passive: true })
  on(root, 'pointermove', event => { if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 9) pointer.moved = true }, { passive: true })
  on(root, 'pointerup', event => {
    clearTimeout(gestureTimer)
    const press = pointer; pointer = null
    if (!press) return
    // A translated/selected word inside an option must never choose its answer.
    if (press.word) blockClick(press.element)
    if (Date.now() - press.time >= 420 || press.moved) { suppressUntil = Date.now() + 700; selectionChanged(); return }
    if (Date.now() < suppressUntil || !window.getSelection()?.isCollapsed) return
    const word = wordFromPoint(press.element, event.clientX, event.clientY)
    if (!word) { close(); return }
    pulse(word.range)
    show({ ...word, element: press.element }, 'word')
  }, { passive: true })
  on(root, 'pointercancel', () => { if (pointer?.word) blockClick(pointer.element); pointer = null; clearTimeout(gestureTimer); suppressUntil = Date.now() + 700 })
  on(root, 'click', event => {
    if (event.detail === 0 || !blockedClick || Date.now() > blockedClick.until || !blockedClick.element.contains(event.target)) return
    event.preventDefault(); event.stopImmediatePropagation()
    blockedClick = null
  }, true)
  on(root, 'contextmenu', event => { if (readingElement(event.target)) { suppressUntil = Date.now() + 1000; selectionChanged() } })
  on(document, 'selectionchange', selectionChanged)
  // Keep the real Android selection and handles while using the action rail.
  on(card, 'pointerdown', event => { if (event.target.closest('button')) event.preventDefault() })
  on(card, 'click', async event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.classList.contains('translation-close')) { close(); return }
    const type = button.dataset.action
    if (type === 'translate' || type === 'retry') infer()
    if (type === 'reselect') { close(); window.getSelection()?.removeAllRanges(); suppressUntil = 0 }
    if (type === 'sentence' && active) {
      const offsets = rangeOffsets(active.element, active.range)
      const sentence = sentenceAt(active.element.textContent, offsets.start, offsets.end)
      const range = textRange(active.element, sentence.start, sentence.end)
      if (range) {
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
        show({ element: active.element, range, text: sentence.text }, 'selection')
      }
    }
    if (type === 'copy' && translated) {
      try {
        if (globalThis.plus?.android) {
          const android = globalThis.plus.android
          const clipboard = android.invoke(android.runtimeMainActivity(), 'getSystemService', 'clipboard')
          const clip = android.invoke('android.content.ClipData', 'newPlainText', '译文', translated)
          android.invoke(clipboard, 'setPrimaryClip', clip)
        } else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(translated)
        else {
          const area = document.createElement('textarea'); area.value = translated
          area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select()
          const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('copy')
        }
        button.textContent = '已复制'
        setTimeout(() => { button.textContent = '复制译文' }, 1200)
      } catch { result.textContent = `${translated}\n复制失败，可长按译文复制` }
    }
  })
  on(window, 'scroll', event => {
    // Scrolling a long source/result belongs to the card, not the article.
    if (event.target?.nodeType && card.contains(event.target)) return
    if (active?.mode === 'word') close(); else if (active) schedulePosition()
  }, true)
  on(window, 'resize', schedulePosition)
  if (window.visualViewport) { on(window.visualViewport, 'resize', schedulePosition); on(window.visualViewport, 'scroll', schedulePosition) }
  on(window, 'hashchange', close)
  on(window, 'cet:native-hide', close)
  on(window, 'cet:native-back', event => {
    if (!active) return
    event.detail.handled = true; event.stopImmediatePropagation(); close()
  }, true)
  on(document, 'keydown', event => { if (event.key === 'Escape' && active) { event.stopImmediatePropagation(); close() } }, true)
  const observer = new MutationObserver(() => { if (active && !active.element.isConnected) close() })
  // Vue teleports exam sheets beside #app, so also observe those removals.
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { close(); listeners.forEach(remove => remove()); observer.disconnect(); feedback.forEach(node => node.remove()); clearTimeout(closeTimer); clearTimeout(gestureTimer); cancelAnimationFrame(positionFrame); card.remove() }
}

import { createApp, reactive, nextTick, ref } from 'vue'
import PaperTransition from '../components/PaperTransition.vue'

// A document-level host keeps layoutId endpoints alive across router changes;
// KeepAlive preserves the list state and origin for the return journey.
export const journey = reactive({ visible: false, expanded: false, title: '', subtitle: '', rect: null, id: '' })
export const questionDirection = ref(1)
let host, busy = false, origin
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
function ensureHost() {
  if (host) return
  host = document.createElement('div'); host.id = 'paper-transition-host'; document.body.append(host)
  createApp(PaperTransition).mount(host)
}
export function rememberPaper(paper, event) {
  const target = event?.currentTarget || document.querySelector(`[data-paper="${paper.id}"]`)
  const rect = target?.getBoundingClientRect()
  origin = { id: paper.id, title: `${paper.year} / ${String(paper.month).padStart(2, '0')}`, subtitle: `第${paper.set_number}套`, rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null }
}
export async function navigatePaper(navigate, { reverse = false, title = '', subtitle = '' } = {}) {
  if (busy) return
  busy = true
  if (!reverse) questionDirection.value = 1
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    ensureHost()
    const fallback = { top: 100, left: 20, width: window.innerWidth - 40, height: 85 }
    Object.assign(journey, { visible: true, expanded: reverse, rect: origin?.rect || fallback, title: title || origin?.title || '真题练习', subtitle: subtitle || origin?.subtitle || '', id: origin?.id || 'paper' })
    await nextTick(); await frame()
    if (reverse) {
      await navigate()
      await nextTick(); await frame()
      const target = origin && document.querySelector(`[data-paper="${origin.id}"]`)
      const rect = target?.getBoundingClientRect()
      if (rect && rect.top >= 0 && rect.top < window.innerHeight) journey.rect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      journey.expanded = false
      await pause(reduce ? 40 : 460)
    } else {
      journey.expanded = true
      await pause(reduce ? 40 : 460)
      await navigate()
      await pause(reduce ? 20 : 80)
    }
  } finally { journey.visible = false; await pause(reduce ? 80 : 170); busy = false }
}

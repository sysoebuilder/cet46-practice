<template>
  <Teleport to="body">
    <MotionConfig reduced-motion="user" :transition="springSheet">
      <AnimatePresence @exit-complete="afterClose">
        <motion.div v-if="open" key="sheet" class="page overlay motion-overlay" :class="{ 'popover-overlay': popover }" :style="{ '--reading-size': `${readingSize}px` }" :initial="false" @click.self="$emit('close')">
          <motion.div class="sheet-backdrop" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" :transition="{ duration: reduced ? 0.08 : 0.25 }" @click="$emit('close')" />
          <motion.section ref="panel" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" :class="['motion-sheet', panelClass, { 'anchored-sheet': popover }]" :style="popover ? position : { y }" :initial="reduced ? { opacity: 0 } : popover ? { opacity: 0, scale: 0.94, y: 8 } : { y: '100%' }" :animate="{ opacity: 1, scale: 1, y: 0 }" :exit="reduced ? { opacity: 0 } : popover ? { opacity: 0, scale: 0.96, y: 6 } : { y: '100%' }" :transition="reduced ? { duration: 0.08 } : springSheet" :drag="popover ? false : 'y'" :drag-controls="dragControls" :drag-listener="false" :drag-momentum="false" :drag-constraints="{ top: 0 }" :drag-elastic="{ top: 0.06, bottom: 0.9 }" @drag-end="release" @click.stop>
            <div v-if="!popover" class="sheet-drag-zone" @pointerdown="dragControls.start($event)"><div class="sheet-handle" /></div>
            <div class="sheet-top" @pointerdown="startFromHeader"><h2 class="sheet-title">{{ title }}</h2><MotionButton class="close-button" :aria-label="closeLabel" @click="$emit('close')"><AppIcon name="X" :size="18" /></MotionButton></div>
            <div class="sheet-content"><slot /></div>
          </motion.section>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  </Teleport>
</template>
<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { motion, AnimatePresence, MotionConfig, useDragControls, useMotionValue, useReducedMotion, animate } from 'motion-v'
import MotionButton from './MotionButton.vue'
import AppIcon from './AppIcon.vue'
import { springSheet } from '../motion/presets'
const props = defineProps({ open: Boolean, title: String, panelClass: [String, Array, Object], popover: Boolean, anchor: Object, readingSize: { type: Number, default: 19 }, closeLabel: { type: String, default: '关闭弹层' } })
const emit = defineEmits(['close'])
const panel = ref(null), position = ref({}), reduced = useReducedMotion()
const y = useMotionValue(0), dragControls = useDragControls()
let previousFocus, oldOverflow, oldBodyStyle, savedScroll, locked = false, animation, inertRoots = []
function element() { return panel.value?.$el || panel.value }
function release(_event, info) {
  if (info.offset.y > 110 || (info.offset.y > 20 && info.velocity.y > 650)) emit('close')
  else { animation?.stop(); animation = animate(y, 0, reduced.value ? { duration: 0 } : springSheet) }
}
function startFromHeader(event) { if (!props.popover && !event.target.closest('button')) dragControls.start(event) }
function place() {
  if (!props.popover || !element()) return
  const viewport = window.visualViewport
  const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight
  const topOffset = viewport?.offsetTop || 0, leftOffset = viewport?.offsetLeft || 0
  const rect = props.anchor?.getBoundingClientRect?.() || { left: width / 2, top: height / 2, bottom: height / 2 }
  // offset sizes exclude the menu's entrance scale. Measuring the animated
  // bounding box here would place the final menu past the viewport edge.
  const box = { width: element().offsetWidth, height: element().offsetHeight }, gutter = 12
  const below = height + topOffset - rect.bottom - gutter, above = rect.top - topOffset - gutter
  const useBelow = below >= Math.min(box.height, 290) || below >= above
  const maxHeight = Math.max(130, Math.min(height - gutter * 2, useBelow ? below : above))
  const h = Math.min(box.height, maxHeight)
  const top = Math.max(topOffset + gutter, Math.min(topOffset + height - h - gutter, useBelow ? rect.bottom + 8 : rect.top - h - 8))
  position.value = { left: `${Math.max(leftOffset + gutter, Math.min(rect.left, leftOffset + width - box.width - gutter))}px`, top: `${top}px`, maxHeight: `${maxHeight - 8}px`, transformOrigin: useBelow ? 'top center' : 'bottom center' }
}
function keydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  if (event.key !== 'Tab') return
  const nodes = [...(element()?.querySelectorAll('button:not([disabled]), [tabindex="0"], textarea') || []), ...document.querySelectorAll('.translation-card.is-open.is-over-sheet button:not([hidden])')].filter(el => el.getClientRects().length)
  if (!nodes.length) { event.preventDefault(); return }
  const first = nodes[0], last = nodes[nodes.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === element())) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function onScroll(event) { if (!element()?.contains(event.target)) place() }
function unlock() {
  if (!locked) return
  document.documentElement.style.overflow = oldOverflow
  Object.assign(document.body.style, oldBodyStyle); locked = false
  for (const [root, wasInert] of inertRoots) root.inert = wasInert
  inertRoots = []
  if (savedScroll.url === window.location.href) window.scrollTo(savedScroll.x, savedScroll.y)
  document.removeEventListener('keydown', keydown)
  window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true)
  window.visualViewport?.removeEventListener('resize', place)
  window.visualViewport?.removeEventListener('scroll', place)
}
function afterClose() { if (!props.open) { unlock(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) } }
watch(() => props.open, async open => {
  if (!open) return
  animation?.stop(); y.set(0)
  if (!locked) {
    previousFocus = document.activeElement; oldOverflow = document.documentElement.style.overflow
    savedScroll = { x: window.scrollX, y: window.scrollY, url: window.location.href }
    oldBodyStyle = Object.fromEntries(['position', 'top', 'left', 'width', 'overflow'].map(key => [key, document.body.style[key]]))
    // Fixed body locking keeps the underlying passage in place on iOS and H5.
    // overflow:hidden alone resets uni-app's window scroll to the top.
    Object.assign(document.body.style, { position: 'fixed', top: `${-savedScroll.y}px`, left: `${-savedScroll.x}px`, width: '100%', overflow: 'hidden' })
    document.documentElement.style.overflow = 'hidden'; locked = true
    inertRoots = [...document.querySelectorAll('.home-inner, .practice-inner')].map(root => [root, root.inert])
    for (const [root] of inertRoots) root.inert = true
    document.addEventListener('keydown', keydown); window.addEventListener('resize', place); window.addEventListener('scroll', onScroll, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
  }
  await nextTick(); place(); element()?.focus({ preventScroll: true })
})
watch(() => [props.anchor, props.title, props.popover], async () => { await nextTick(); place() })
onBeforeUnmount(() => { unlock(); animation?.stop() })
</script>

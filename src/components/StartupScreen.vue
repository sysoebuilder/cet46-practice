<template>
  <Teleport to="body">
    <MotionConfig reduced-motion="user">
      <AnimatePresence @exit-complete="finish">
        <motion.div v-if="visible" class="startup-screen startup-motion" role="status" aria-label="正在准备练习" :initial="false" :exit="{ opacity: 0 }" :transition="reduced ? { duration: 0.08 } : startupMotion.exit">
          <div class="startup-mark"><motion.img :src="brand.icon" class="startup-icon" width="136" height="136" alt="" :initial="reduced ? false : { scale: 0.96, y: 6 }" :animate="{ scale: 1, y: 0 }" :transition="springSmooth" /></div>
          <div class="startup-copy"><h1 class="startup-title">{{ brand.name }}</h1><p class="startup-caption">每一道题，都是积累。</p></div>
          <div class="startup-status"><span class="startup-track" aria-hidden="true"><motion.span class="startup-travel" :initial="false" :animate="reduced ? { x: 24 } : { x: [-32, 80] }" :transition="reduced ? { duration: 0 } : startupMotion.travel" /></span><span>正在准备练习</span></div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  </Teleport>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'motion-v'
import { springSmooth, startupMotion } from '../motion/presets'
import brand from '../data/brand.json'
const emit = defineEmits(['done'])
const visible = ref(true), reduced = useReducedMotion()
let timer, disposed = false
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
function finish() { if (!visible.value) { window.__CET_BOOT__?.finish(); emit('done') } }
onMounted(async () => {
  const start = performance.now()
  await nextTick(); await frame()
  if (disposed) return
  window.__CET_BOOT__?.mounted()
  // A brief settling beat, not a simulated progress percentage or long delay.
  const remaining = reduced.value ? 0 : Math.max(0, startupMotion.settleMs - (performance.now() - start))
  timer = setTimeout(() => { if (!disposed) visible.value = false }, remaining)
})
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

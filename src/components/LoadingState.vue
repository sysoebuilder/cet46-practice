<template>
  <div :class="['loading-state', `loading-${variant}`]" role="status" aria-live="polite">
    <span class="loading-label">{{ label }}</span>
    <motion.div class="loading-skeleton" aria-hidden="true" :initial="false" :animate="reduced ? { opacity: 0.7 } : { opacity: [0.45, 0.9, 0.45] }" :transition="reduced ? { duration: 0 } : loadingPulse">
      <div v-for="row in (variant === 'sections' ? 3 : 4)" :key="row" class="loading-line" :class="{ 'loading-line-short': row === (variant === 'sections' ? 3 : 4) }" />
    </motion.div>
  </div>
</template>
<script setup>
import { motion, useReducedMotion } from 'motion-v'
import { loadingPulse } from '../motion/presets'
defineProps({ variant: { type: String, default: 'paper' }, label: { type: String, default: '正在读取试卷…' } })
const reduced = useReducedMotion()
</script>
<style>
.loading-state { width: 100%; padding: 22px 0; }
.loading-label { display: block; margin-bottom: 24px; color: var(--muted); font-size: 14px; }
.loading-skeleton { display: flex; flex-direction: column; gap: 18px; }
.loading-line { height: 12px; border-radius: 6px; background: #e4eee8; }
.loading-line-short { width: 64%; }
.loading-sections .loading-line { height: 44px; border-radius: 12px; }
.loading-sections .loading-line-short { width: 100%; }
</style>

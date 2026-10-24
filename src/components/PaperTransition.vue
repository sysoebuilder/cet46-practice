<template>
  <MotionConfig reduced-motion="user" :transition="springSmooth">
    <LayoutGroup id="paper-journey">
      <AnimatePresence>
        <motion.div v-if="journey.visible" key="journey" class="paper-journey" :exit="{ opacity: 0 }" :transition="{ duration: 0.16 }" aria-hidden="true">
          <motion.div v-if="!journey.expanded" key="card" :layout-id="journey.id" class="journey-surface journey-card" :style="cardStyle" :transition="springSmooth"><motion.div :layout-id="`${journey.id}-title`" class="journey-title">{{ journey.title }}</motion.div><motion.div :layout-id="`${journey.id}-meta`" class="journey-meta">{{ journey.subtitle }}</motion.div></motion.div>
          <motion.div v-else key="page" :layout-id="journey.id" class="journey-surface journey-page" :transition="springSmooth"><motion.div :layout-id="`${journey.id}-title`" class="journey-title">{{ journey.title }}</motion.div><motion.div :layout-id="`${journey.id}-meta`" class="journey-meta">{{ journey.subtitle }}</motion.div></motion.div>
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  </MotionConfig>
</template>
<script setup>
import { computed } from 'vue'
import { motion, MotionConfig, AnimatePresence, LayoutGroup } from 'motion-v'
import { journey } from '../motion/navigation'
import { springSmooth } from '../motion/presets'
const cardStyle = computed(() => ({ top: `${journey.rect.top}px`, left: `${journey.rect.left}px`, width: `${journey.rect.width}px`, height: `${journey.rect.height}px`, borderRadius: '18px' }))
</script>

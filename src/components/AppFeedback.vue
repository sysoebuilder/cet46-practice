<template>
  <Teleport to="body">
    <MotionConfig reduced-motion="user">
      <AnimatePresence>
        <motion.div v-if="feedback.toast" class="app-toast" role="status" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, y: 8 }" :transition="fadeSlide">{{ feedback.toast }}</motion.div>
      </AnimatePresence>
    </MotionConfig>
  </Teleport>
  <MotionSheet :open="Boolean(feedback.modal)" :title="feedback.modal?.title || ''" panel-class="app-modal" @close="resolveModal(false)">
    <p class="app-modal-copy">{{ feedback.modal?.content }}</p>
    <div class="app-modal-actions">
      <MotionButton v-if="feedback.modal?.showCancel" class="secondary-button" @click="resolveModal(false)">{{ feedback.modal?.cancelText || '取消' }}</MotionButton>
      <MotionButton class="primary-button" @click="resolveModal(true)">{{ feedback.modal?.confirmText || '确定' }}</MotionButton>
    </div>
  </MotionSheet>
</template>
<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { motion, AnimatePresence, MotionConfig } from 'motion-v'
import MotionSheet from './MotionSheet.vue'
import { feedback, resolveModal } from '../utils/feedback'
import { fadeSlide } from '../motion/presets'
function closeOnBack(event) {
  if (feedback.modal) { event.stopImmediatePropagation(); event.detail.handled = true; resolveModal(false) }
}
onMounted(() => window.addEventListener('cet:native-back', closeOnBack, true))
onBeforeUnmount(() => window.removeEventListener('cet:native-back', closeOnBack, true))
</script>

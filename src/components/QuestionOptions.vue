<template>
  <div class="question-options">
    <span v-if="!revealed" class="translation-gesture-hint">点字母选择答案 · 点英文翻译 · 长按选择文本</span>
    <motion.div initial="hidden" animate="visible" :variants="{ hidden: {}, visible: { transition: { staggerChildren } } }" :class="['options', { 'paragraph-options': sectionId === 'matching', 'word-options': sectionId === 'cloze' }]">
      <motion.div role="button" tabindex="0" :variants="{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }" :transition="springSnappy" v-for="option in item.options" :key="option.label" :class="['option', { chosen: response === option.label, 'correct-choice': revealed && review?.answer === option.label, 'incorrect-choice': revealed && review?.status === 'incorrect' && response === option.label }]" :aria-label="`选择 ${option.label} ${option.text || ''}`" :aria-pressed="response === option.label" :aria-disabled="revealed" @click="!revealed && $emit('choose', option.label)" @keydown.enter.self="!revealed && $emit('choose', option.label)" @keydown.space.self.prevent="!revealed && $emit('choose', option.label)">
        <span class="option-label">{{ option.label }}</span><span v-if="option.text" class="option-text">{{ option.text }}</span>
        <AnimatePresence><motion.span v-if="response === option.label || (revealed && review?.answer === option.label)" key="check" :initial="{ opacity: 0, scale: 0.6 }" :animate="{ opacity: 1, scale: 1 }" :exit="{ opacity: 0, scale: 0.8 }" :transition="springSnappy" class="option-check">{{ revealed && review?.status === 'missing' ? '已选' : revealed && review?.status === 'incorrect' && response === option.label ? '×' : '✓' }}</motion.span></AnimatePresence>
      </motion.div>
    </motion.div>
  </div>
</template>
<script setup>
import { motion, AnimatePresence } from 'motion-v'
import { springSnappy, staggerChildren } from '../motion/presets'
defineProps({ item: { type: Object, required: true }, response: String, sectionId: String, revealed: Boolean, review: Object })
defineEmits(['choose'])
</script>

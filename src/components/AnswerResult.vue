<template>
  <motion.div :initial="{ opacity: 0, y: 5 }" :animate="{ opacity: 1, y: 0 }" :transition="fadeSlide" :class="['answer-result', `result-${review.status}`]">
    <span class="result-status">{{ labels[review.status] }}</span>
    <MotionButton v-if="review.answer" class="result-answer" :aria-label="`第${number}题答案 ${review.answer}，查看解析`" @click="$emit('explain')"><span>{{ review.status === 'correct' ? '答案' : '正确答案' }} {{ review.answer }}<span v-if="review.answerText"> · {{ review.answerText }}</span></span><span class="result-hint">解析 ›</span></MotionButton>
    <MotionButton v-else-if="review.status === 'reference' && review.references.length" class="result-answer" @click="$emit('explain')">查看参考答案 ›</MotionButton>
    <span v-else-if="review.status === 'reference'" class="review-missing">答案缺失</span>
  </motion.div>
</template>
<script setup>
import { motion } from 'motion-v'
import { fadeSlide } from '../motion/presets'
defineProps({ review: { type: Object, required: true }, number: [Number, String] })
defineEmits(['explain'])
const labels = { correct: '✓ 正确', incorrect: '× 错误', unanswered: '× 未作答', missing: '答案缺失', reference: '自行对照' }
</script>

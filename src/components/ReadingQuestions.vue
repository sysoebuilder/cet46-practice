<template>
  <ScrollArea class="question-picker-scroll" scroll-y :scroll-into-view="scrollTarget" :show-scrollbar="false">
    <span class="translation-gesture-hint">点题号或箭头展开 · 点英文翻译 · 长按选择文本</span>
    <div v-for="(item, index) in items" :id="`reading-question-${item.key}`" :key="item.key" :class="['question-entry', { answered: selected(item), expanded: expandedIndex === index }, checked ? `checked-${reviewFor(item).status}` : '']">
      <motion.div class="question-summary" role="button" tabindex="0" :aria-label="`第${item.number}题`" :aria-expanded="expandedIndex === index" @click="$emit('toggle', index)" @keydown.enter.self="$emit('toggle', index)" @keydown.space.self.prevent="$emit('toggle', index)">
        <div class="question-summary-heading"><span class="question-number">{{ item.number }}</span><span v-if="item.title" class="question-passage-label">{{ item.title }}</span><span class="dropdown-chevron"><motion.span :animate="{ rotate: expandedIndex === index ? 180 : 0 }" :transition="fadeSlide" class="chevron-motion"><AppIcon name="ChevronDown" :size="18" /></motion.span></span></div>
        <span class="question-stem">{{ item.stem }}</span>
        <span v-if="selected(item)" class="chosen-answer">已选 {{ selected(item).label }}<span v-if="selected(item).text"> · {{ selected(item).text }}</span></span>
        <span v-else class="question-unanswered">未作答</span>
      </motion.div>
      <AnswerResult v-if="checked" :review="reviewFor(item)" :number="item.number" @explain="$emit('explain', item)" />
      <AnimatePresence><motion.div v-if="expandedIndex === index" :key="item.key" class="question-dropdown" :initial="{ opacity: 0, y: -7 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, y: -5 }" :transition="fadeSlide">
        <QuestionOptions :item="item" :response="answers[item.key]" :section-id="sectionId" :revealed="checked" :review="reviewFor(item)" @choose="$emit('choose', { item, label: $event })" />
      </motion.div></AnimatePresence>
    </div>
  </ScrollArea>
</template>
<script setup>
import { ref, watch, nextTick } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import { fadeSlide } from '../motion/presets'
import QuestionOptions from './QuestionOptions.vue'
import AnswerResult from './AnswerResult.vue'
import { answerReview } from '../utils/solutions.mjs'
const props = defineProps({ items: { type: Array, required: true }, answers: { type: Object, required: true }, paper: { type: Object, required: true }, sectionId: String, expandedIndex: { type: Number, default: null }, checked: Boolean })
defineEmits(['toggle', 'choose', 'explain'])
const scrollTarget = ref('')
function selected(item) { return item.options.find(option => option.label === props.answers[item.key]) }
function reviewFor(item) { return answerReview(props.paper, props.sectionId, item, props.answers[item.key]) }
watch(() => props.expandedIndex, async index => {
  scrollTarget.value = ''
  if (index !== null && props.items[index]) { await nextTick(); scrollTarget.value = `reading-question-${props.items[index].key}` }
}, { immediate: true })
</script>

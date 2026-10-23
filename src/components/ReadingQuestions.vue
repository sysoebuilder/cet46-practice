<template>
  <scroll-view class="question-picker-scroll" scroll-y :scroll-into-view="scrollTarget" :show-scrollbar="false">
    <view v-for="(item, index) in items" :id="`reading-question-${item.key}`" :key="item.key" :class="['question-entry', { answered: selected(item), expanded: expandedIndex === index }]">
      <button class="question-summary" :aria-label="`第${item.number}题`" :aria-expanded="expandedIndex === index" @click="$emit('toggle', index)">
        <view class="question-summary-heading"><text class="question-number">{{ item.number }}</text><text v-if="item.title" class="question-passage-label">{{ item.title }}</text><text class="dropdown-chevron">{{ expandedIndex === index ? '⌃' : '⌄' }}</text></view>
        <text class="question-stem">{{ item.stem }}</text>
        <text v-if="selected(item)" class="chosen-answer">已选 {{ selected(item).label }}<text v-if="selected(item).text"> · {{ selected(item).text }}</text></text>
        <text v-else class="question-unanswered">未作答</text>
      </button>
      <view v-if="expandedIndex === index" class="question-dropdown">
        <QuestionOptions :item="item" :response="answers[item.key]" :section-id="sectionId" :revealed="revealed" :review="reviewFor(item)" @choose="$emit('choose', { item, label: $event })" />
        <button class="review-toggle" @click="$emit('reveal')">{{ revealed ? '收起' : '查看答案与解析' }}</button>
        <AnswerReview v-if="revealed" :review="reviewFor(item)" />
      </view>
    </view>
  </scroll-view>
</template>
<script setup>
import { ref, watch, nextTick } from 'vue'
import QuestionOptions from './QuestionOptions.vue'
import AnswerReview from './AnswerReview.vue'
import { answerReview } from '../utils/solutions.mjs'
const props = defineProps({ items: { type: Array, required: true }, answers: { type: Object, required: true }, paper: { type: Object, required: true }, sectionId: String, expandedIndex: { type: Number, default: null }, revealed: Boolean })
defineEmits(['toggle', 'choose', 'reveal'])
const scrollTarget = ref('')
function selected(item) { return item.options.find(option => option.label === props.answers[item.key]) }
function reviewFor(item) { return answerReview(props.paper, props.sectionId, item, props.answers[item.key]) }
watch(() => props.expandedIndex, async index => {
  scrollTarget.value = ''
  if (index !== null && props.items[index]) { await nextTick(); scrollTarget.value = `reading-question-${props.items[index].key}` }
}, { immediate: true })
</script>

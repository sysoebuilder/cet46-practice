<template>
  <div class="answer-review">
    <template v-if="review.status === 'reference'">
      <span v-if="!review.references.length" class="review-missing">答案缺失</span>
      <div v-for="(reference, index) in review.references" :key="index" class="reference-material"><span class="review-label">{{ reference.title || '答案' }}</span><span class="review-body">{{ reference.text }}</span></div>
    </template>
    <span v-else-if="review.status === 'missing'" class="review-missing">答案缺失</span>
    <template v-else>
      <div class="review-answer-row"><span class="review-label">答案</span><span class="review-letter">{{ review.answer }}</span><span v-if="review.status === 'correct' || review.status === 'incorrect'" :class="['review-result', { incorrect: review.status === 'incorrect' }]">{{ review.status === 'correct' ? '回答正确' : '回答有误' }}</span></div>
      <span v-if="review.answerText" class="review-option-text">{{ review.answerText }}</span>
      <span class="review-label">解析</span><span :class="['review-body', { 'review-missing': !review.explanation }]">{{ review.explanation || '解析暂缺' }}</span>
    </template>
  </div>
</template>
<script setup>
defineProps({ review: { type: Object, required: true } })
</script>

<template>
  <view class="answer-review">
    <template v-if="review.status === 'reference'">
      <text v-if="!review.references.length" class="review-missing">答案缺失</text>
      <view v-for="(reference, index) in review.references" :key="index" class="reference-material"><text class="review-label">{{ reference.title || '答案' }}</text><text class="review-body">{{ reference.text }}</text></view>
    </template>
    <text v-else-if="review.status === 'missing'" class="review-missing">答案缺失</text>
    <template v-else>
      <view class="review-answer-row"><text class="review-label">答案</text><text class="review-letter">{{ review.answer }}</text><text v-if="review.status === 'correct' || review.status === 'incorrect'" :class="['review-result', { incorrect: review.status === 'incorrect' }]">{{ review.status === 'correct' ? '回答正确' : '回答有误' }}</text></view>
      <text v-if="review.answerText" class="review-option-text">{{ review.answerText }}</text>
      <text class="review-label">解析</text><text :class="['review-body', { 'review-missing': !review.explanation }]">{{ review.explanation || '解析暂缺' }}</text>
    </template>
  </view>
</template>
<script setup>
defineProps({ review: { type: Object, required: true } })
</script>

<template>
  <view :class="['options', { 'paragraph-options': sectionId === 'matching', 'word-options': sectionId === 'cloze' }]">
    <button v-for="option in item.options" :key="option.label" :class="['option', { chosen: response === option.label, 'correct-choice': revealed && review?.answer === option.label, 'incorrect-choice': revealed && review?.status === 'incorrect' && response === option.label }]" :aria-label="`${option.label} ${option.text}`" :aria-pressed="response === option.label" @click="$emit('choose', option.label)"><text class="option-label">{{ option.label }}</text><text v-if="option.text" class="option-text">{{ option.text }}</text><text v-if="response === option.label" class="option-check">{{ revealed && review?.status === 'incorrect' ? '×' : '✓' }}</text></button>
  </view>
</template>
<script setup>
defineProps({ item: { type: Object, required: true }, response: String, sectionId: String, revealed: Boolean, review: Object })
defineEmits(['choose'])
</script>

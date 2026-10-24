<template>
  <motion.button type="button" :while-press="reduced || disabled ? undefined : { scale: 0.965 }" :transition="springSnappy" :disabled="disabled"><slot /></motion.button>
</template>
<script setup>
import { motion, useReducedMotion } from 'motion-v'
import { springSnappy } from '../motion/presets'
defineProps({ disabled: Boolean })
const reduced = useReducedMotion()
</script>

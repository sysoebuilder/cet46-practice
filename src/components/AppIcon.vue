<template><component :is="icons[name] || ArrowRight" :size="size" :stroke-width="1.8" aria-hidden="true" class="app-icon" /></template>
<script setup>
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, ChevronDown, X, Check, Grid2X2, Headphones, PenLine, Languages, BookOpen, TextSelect, ListFilter, WifiOff, Play, Pause } from '@lucide/vue'
defineProps({ name: String, size: { type: Number, default: 20 } })
const icons = { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, ChevronDown, X, Check, Grid2X2, Headphones, PenLine, Languages, BookOpen, TextSelect, ListFilter, WifiOff, Play, Pause }
</script>

<template><div ref="area" class="scroll-area" :class="scrollX ? 'scroll-area-x' : 'scroll-area-y'"><slot /></div></template>
<script setup>
import { ref, watch, nextTick } from 'vue'
const props = defineProps({ scrollX: Boolean, scrollY: Boolean, scrollIntoView: String, showScrollbar: Boolean })
const area = ref(null)
watch(() => props.scrollIntoView, async id => {
  if (!id) return
  await nextTick()
  const container = area.value
  const target = container?.querySelector(`#${CSS.escape(id)}`)
  if (!target) return
  const outer = container.getBoundingClientRect(), inner = target.getBoundingClientRect()
  // Scroll just this area, preserving the passage behind a sheet.
  container.scrollTop += inner.top - outer.top
})
</script>

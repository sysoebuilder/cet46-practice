<template>
  <div class="listening-player">
    <div class="audio-top-row"><span class="audio-title">听力音频</span><span v-if="state.saveFailed" class="audio-note">播放位置未保存</span></div>
    <div class="audio-controls"><MotionButton class="audio-play-button" :aria-label="state.error ? '重试播放' : state.playing ? '暂停听力' : '播放听力'" @click="toggle"><AppIcon :name="state.playing ? 'Pause' : 'Play'" :size="16" />{{ state.error ? '重试' : state.playing ? '暂停' : state.loading ? '加载中' : '播放' }}</MotionButton><div class="audio-timeline"><input type="range" aria-label="听力播放进度" class="audio-slider" :value="sliderValue" :max="1000" :disabled="!state.duration" min="0" step="1" @input="drag" @change="seek" /><div class="audio-times"><span>{{ formatAudioTime(displayPosition) }}</span><span>{{ formatAudioTime(state.duration) }}</span></div></div></div>
    <span v-if="state.error" class="audio-error">音频播放失败，请点击重试</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createListeningPlayer, formatAudioTime } from '../utils/listening-player.mjs'

const props = defineProps({ source: { type: Object, required: true }, paperId: { type: String, required: true }, active: { type: Boolean, default: true } })
const state = ref({ position: 0, duration: 0, playing: false, loading: false, error: false, saveFailed: false })
const draggedPosition = ref(null)
const displayPosition = computed(() => draggedPosition.value ?? state.value.position)
const sliderValue = computed(() => state.value.duration ? Math.round(displayPosition.value / state.value.duration * 1000) : 0)
let player = null
function initialize() {
  player?.destroy()
  draggedPosition.value = null
  state.value = { position: 0, duration: 0, playing: false, loading: false, error: false, saveFailed: false }
  try { player = createListeningPlayer({ source: props.source, paperId: props.paperId, onChange: value => { state.value = value } }) }
  catch { state.value.error = true; player = null }
}
function toggle() {
  if (!props.active) return
  if (state.value.error || !player) initialize()
  if (state.value.playing) player?.pause()
  else player?.play()
}
function drag(event) { draggedPosition.value = Number(event.target.value) / 1000 * state.value.duration }
function seek(event) { player?.seek(Number(event.target.value) / 1000 * state.value.duration); draggedPosition.value = null }
watch(() => [props.source.src, props.source.sha256, props.paperId], initialize, { immediate: true })
watch(() => props.active, active => { if (!active) player?.pause() })
onBeforeUnmount(() => { player?.destroy(); player = null })
defineExpose({ pause: () => player?.pause() })
</script>

<template>
  <view class="listening-player">
    <view class="audio-top-row"><text class="audio-title">听力音频</text><text v-if="state.saveFailed" class="audio-note">播放位置未保存</text></view>
    <view class="audio-controls"><button class="audio-play-button" :aria-label="state.error ? '重试播放' : state.playing ? '暂停听力' : '播放听力'" @click="toggle">{{ state.error ? '重试' : state.playing ? '暂停' : state.loading ? '加载中' : '播放' }}</button><view class="audio-timeline"><slider class="audio-slider" :value="sliderValue" :max="1000" :disabled="!state.duration" :block-size="18" activeColor="#4d7657" backgroundColor="#dce4d1" @changing="drag" @change="seek" /><view class="audio-times"><text>{{ formatAudioTime(displayPosition) }}</text><text>{{ formatAudioTime(state.duration) }}</text></view></view></view>
    <text v-if="state.error" class="audio-error">音频播放失败，请点击重试</text>
  </view>
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
function drag(event) { draggedPosition.value = event.detail.value / 1000 * state.value.duration }
function seek(event) { player?.seek(event.detail.value / 1000 * state.value.duration); draggedPosition.value = null }
watch(() => [props.source.src, props.source.sha256, props.paperId], initialize, { immediate: true })
watch(() => props.active, active => { if (!active) player?.pause() })
onBeforeUnmount(() => { player?.destroy(); player = null })
defineExpose({ pause: () => player?.pause() })
</script>

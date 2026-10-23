<template>
  <view class="home page">
    <view class="home-inner">
      <view class="brand-row"><view class="brand-mark">四六</view><text class="brand-name">轻松刷真题</text><text class="offline">离线可用</text></view>
      <view class="heading-row"><text class="page-title">真题</text><text class="subtle">{{ levelPapers.length }} 套</text><button class="history-entry" @click="openHistory">历史</button></view>
      <view class="level-switch"><button v-for="entry in levels" :key="entry.id" :class="['level-button', { active: level === entry.id }]" @click="setLevel(entry.id)">{{ entry.name }}<text class="level-english">{{ entry.label }}</text></button></view>
      <view v-if="recent" class="resume-card" @click="openPractice(recent.paperId, recent.sectionId)">
        <view><text class="resume-label">继续上次</text><text class="resume-title">{{ recentTitle }}</text><text class="resume-detail">{{ sectionName(recent.sectionId) }} · 已答 {{ recent.answered || 0 }} / {{ recent.total }}</text></view>
        <button class="resume-arrow" aria-label="继续上次练习">→</button>
      </view>
      <scroll-view scroll-x class="year-scroll" :show-scrollbar="false"><view class="year-list"><button v-for="year in years" :key="year" :class="['year-chip', { selected: selectedYear === year }]" @click="selectedYear = year">{{ year }}</button><button v-if="years.length" :class="['year-chip', { selected: selectedYear === 0 }]" @click="selectedYear = 0">全部</button></view></scroll-view>
      <view class="session-grid"><view v-for="session in sessions" :key="session.key" class="session-card">
        <view class="session-heading"><text>{{ session.year }}<text class="session-month"> / {{ String(session.month).padStart(2, '0') }}</text></text><text class="session-caption">{{ session.month }}月真题</text></view>
        <view class="paper-list"><button v-for="paper in session.papers" :key="paper.id" class="paper-row" @click="selectPaper(paper)"><view class="paper-row-left"><text class="paper-label">第{{ paper.set_number }}套</text><text v-if="paperAnswered(paper.id)" class="paper-progress">已答 {{ paperAnswered(paper.id) }} 题</text><text v-else class="paper-idle">未开始</text></view><text class="row-arrow">↗</text></button></view>
      </view></view>
      <text v-if="!sessions.length" class="empty-note">暂无真题</text>
      <text v-if="storageError" class="error-note">进度读取失败，请重新打开应用</text>
    </view>
    <view v-if="selectedPaper" class="overlay" @click="closeSheet"><view class="section-sheet" @click.stop>
      <view class="sheet-handle" /><view class="sheet-top"><view><text class="sheet-eyebrow">{{ level === 'CET4' ? '四级' : '六级' }}真题</text><text class="sheet-title">{{ paperTitle(selectedPaper) }}</text></view><button class="close-button" aria-label="关闭题型选择" @click="closeSheet">×</button></view>
      <text v-if="loading" class="empty-note">正在读取试卷…</text>
      <view v-else-if="loadError" class="load-error"><text>试卷读取失败</text><button class="secondary-button" @click="selectPaper(selectedPaper)">重试</button></view>
      <view v-else class="section-list"><button v-for="section in sections" :key="section.id" :class="['section-row', { 'section-missing': !section.items.length }]" @click="selectSection(section)"><view :class="['type-mark', section.id]">{{ section.mark }}</view><view class="section-row-copy"><text class="section-name">{{ section.name }}</text><text class="section-meta">{{ section.items.length ? sectionProgress(section) : '题目缺失' }}</text></view><text class="section-arrow">›</text></button></view><button class="section-score-button secondary-button" @click="openScore">整卷评分</button>
    </view></view>
  </view>
</template>
<script setup>
import { computed, ref } from 'vue'
import { onShow, onBackPress } from '@dcloudio/uni-app'
import catalog from '../../data/catalog.json'
import { buildSections, paperTitle, missingSectionMessage, SECTION_DEFS } from '../../utils/paper.mjs'
import { allProgress, loadPaper } from '../../utils/storage.js'
import audioCatalog from '../../data/audio.json'
const levels = [{ id: 'CET4', name: '四级', label: 'CET–4' }, { id: 'CET6', name: '六级', label: 'CET–6' }]
const level = ref('CET4'), selectedYear = ref(0), progress = ref([]), storageError = ref(false)
const selectedPaper = ref(null), sections = ref([]), loading = ref(false), loadError = ref(false)
let requestVersion = 0
const levelPapers = computed(() => catalog.filter(p => p.level === level.value))
const years = computed(() => [...new Set(levelPapers.value.map(p => p.year))].sort((a, b) => b - a))
selectedYear.value = years.value[0] || 0
const sessions = computed(() => {
  const map = new Map()
  for (const paper of levelPapers.value.filter(p => !selectedYear.value || p.year === selectedYear.value)) {
    const key = `${paper.year}-${paper.month}`
    if (!map.has(key)) map.set(key, { key, year: paper.year, month: paper.month, papers: [] })
    map.get(key).papers.push(paper)
  }
  return [...map.values()]
})
const recent = computed(() => progress.value.find(p => levelPapers.value.some(paper => paper.id === p.paperId) && SECTION_DEFS.some(s => s.id === p.sectionId)))
const recentTitle = computed(() => { const paper = catalog.find(p => p.id === recent.value?.paperId); return paper ? paperTitle(paper) : '' })
function setLevel(value) {
  level.value = value
  if (!years.value.includes(selectedYear.value)) selectedYear.value = years.value[0] || 0
  try { uni.setStorageSync('cet:level', value) } catch { /* Reading remains available. */ }
}
function sectionName(id) { return SECTION_DEFS.find(s => s.id === id)?.name || '' }
function openHistory() { uni.navigateTo({ url: '/pages/history/index' }) }
function paperAnswered(id) { return progress.value.filter(p => p.paperId === id).reduce((sum, p) => sum + (p.answered || 0), 0) }
function sectionProgress(section) {
  const record = progress.value.find(p => p.paperId === selectedPaper.value.id && p.sectionId === section.id)
  return record?.answered ? `已答 ${record.answered} / ${section.items.length}` : `${section.items.length} 题`
}
function closeSheet() { requestVersion++; selectedPaper.value = null }
async function selectPaper(paper) {
  selectedPaper.value = paper; loading.value = true; loadError.value = false
  const version = ++requestVersion
  try { const data = await loadPaper(paper.id); if (version === requestVersion) sections.value = buildSections(data) }
  catch { if (version === requestVersion) loadError.value = true }
  finally { if (version === requestVersion) loading.value = false }
}
function openPractice(paperId, sectionId) {
  closeSheet()
  uni.navigateTo({ url: `/pages/practice/index?paper=${encodeURIComponent(paperId)}&section=${sectionId}` })
}
function openScore() {
  const paperId = selectedPaper.value.id
  closeSheet()
  uni.navigateTo({ url: `/pages/score/index?paper=${encodeURIComponent(paperId)}` })
}
function selectSection(section) {
  if (!section.items.length) {
    const paperId = selectedPaper.value.id
    const audioOnly = section.id === 'listening' && Boolean(audioCatalog[paperId])
    uni.showModal({
      title: '题目缺失',
      content: audioOnly ? `${missingSectionMessage(section)}也可单独播放本套听力音频。` : missingSectionMessage(section),
      showCancel: audioOnly, confirmText: audioOnly ? '播放音频' : '知道了', cancelText: '返回选题',
      success(result) { if (audioOnly && result.confirm) openPractice(paperId, section.id) },
    })
    return
  }
  openPractice(selectedPaper.value.id, section.id)
}
onShow(() => {
  try {
    const savedLevel = uni.getStorageSync('cet:level')
    if (levels.some(entry => entry.id === savedLevel)) setLevel(savedLevel)
    progress.value = allProgress(); storageError.value = false
  } catch { storageError.value = true }
})
onBackPress(() => { if (selectedPaper.value) { closeSheet(); return true } return false })
</script>

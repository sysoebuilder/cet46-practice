<template>
  <MotionConfig reduced-motion="user" :transition="springSnappy">
  <div class="home page">
    <div class="home-inner" role="main">
      <div class="brand-row"><div class="brand-mark">四六</div><span class="brand-name">轻松刷真题</span><span class="offline"><AppIcon name="WifiOff" :size="13" />离线可用</span></div>
      <div class="home-intro"><div class="heading-row"><span class="page-title">真题<span class="title-period">.</span></span><span class="subtle">{{ levelPapers.length }} 套</span></div><span class="editorial-caption">A little practice, every day.</span></div>
      <LayoutGroup id="home-controls">
        <div class="level-switch" role="group" aria-label="选择考试级别"><MotionButton v-for="entry in levels" :key="entry.id" :class="['level-button', { active: level === entry.id }]" :aria-pressed="level === entry.id" @click="setLevel(entry.id)"><motion.span v-if="level === entry.id" layout-id="level-active" class="segment-indicator" :transition="springSnappy" /><span class="segment-copy">{{ entry.name }}<span class="level-english">{{ entry.label }}</span></span></MotionButton></div>
        <MotionButton v-if="recent" class="resume-card" @click="openPractice(recent.paperId, recent.sectionId, $event)"><div class="resume-copy"><span class="resume-label">接着上次，继续进步</span><span class="resume-title">{{ recentTitle }}</span><span class="resume-detail">{{ sectionName(recent.sectionId) }} · 已答 {{ recent.answered || 0 }} / {{ recent.total }}</span><div class="resume-track"><motion.div :initial="false" :animate="{ scaleX: recent.total ? (recent.answered || 0) / recent.total : 0 }" :transition="springSmooth" class="resume-fill" /></div></div><span class="resume-arrow"><AppIcon name="ArrowRight" :size="23" /></span></MotionButton>
        <div class="library-label"><span>历年试卷</span><span class="library-caption">选择年份，开始练习</span></div>
        <ScrollArea scroll-x class="year-scroll" :show-scrollbar="false"><div class="year-list"><MotionButton v-for="year in [...years, 0]" :key="year" :class="['year-chip', { selected: selectedYear === year }]" :aria-pressed="selectedYear === year" @click="selectedYear = year"><motion.span v-if="selectedYear === year" layout-id="year-active" class="year-indicator" :transition="springSnappy" /><span>{{ year || '全部' }}</span></MotionButton></div></ScrollArea>
      </LayoutGroup>
      <AnimatePresence mode="wait" :initial="false">
        <motion.div :key="`${level}-${selectedYear}`" class="session-grid" :initial="{ opacity: 0, y: 9 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, y: -6 }" :transition="fadeSlide">
          <div v-for="session in sessions" :key="session.key" class="session-card">
            <div class="session-heading"><span>{{ session.year }}<span class="session-month"> / {{ String(session.month).padStart(2, '0') }}</span></span><span class="session-caption">{{ session.month }}月真题</span></div>
            <div class="paper-list"><MotionButton v-for="paper in session.papers" :key="paper.id" :data-paper="paper.id" class="paper-row" @click="selectPaper(paper, $event)"><span class="paper-ordinal">{{ String(paper.set_number).padStart(2, '0') }}</span><div class="paper-row-left"><span class="paper-label">第{{ paper.set_number }}套</span><span v-if="paperAnswered(paper.id)" class="paper-progress">已答 {{ paperAnswered(paper.id) }} 题</span><span v-else class="paper-idle">未开始</span></div><span class="row-arrow"><AppIcon name="ArrowUpRight" /></span></MotionButton></div>
          </div>
        </motion.div>
      </AnimatePresence>
      <span v-if="!sessions.length" class="empty-note">暂无真题</span><span v-if="storageError" class="error-note">进度读取失败，请重新打开应用</span>
      <div class="home-footnote"><span class="footnote-line" /><span>每一道题，都是积累。</span></div>
    </div>
    <MotionSheet :open="Boolean(selectedPaper)" :title="displayedPaper ? paperTitle(displayedPaper) : ''" panel-class="section-sheet" close-label="关闭题型选择" @close="closeSheet">
      <span class="sheet-eyebrow">{{ level === 'CET4' ? '四级' : '六级' }}真题 · 选择练习题型</span>
      <span v-if="loading" class="empty-note">正在读取试卷…</span>
      <div v-else-if="loadError" class="load-error"><span>试卷读取失败</span><MotionButton class="secondary-button" @click="selectPaper(selectedPaper)">重试</MotionButton></div>
      <motion.div v-else class="section-list" initial="hidden" animate="visible" :variants="{ hidden: {}, visible: { transition: { staggerChildren } } }"><motion.button type="button" v-for="section in sections" :key="section.id" :variants="{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }" :while-press="{ scale: 0.975 }" :transition="springSnappy" :class="['section-row', { 'section-missing': !section.items.length }]" @click="selectSection(section)"><div :class="['type-mark', section.id]"><AppIcon :name="sectionIcons[section.id]" /></div><div class="section-row-copy"><span class="section-name">{{ section.name }}</span><span class="section-meta">{{ section.items.length ? sectionProgress(section) : '题目缺失' }}</span></div><AppIcon name="ChevronRight" class="section-arrow" :size="18" /></motion.button></motion.div>
    </MotionSheet>
  </div>
  </MotionConfig>
</template>
<script setup>
import { computed, ref, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { motion, MotionConfig, LayoutGroup, AnimatePresence } from 'motion-v'
import MotionSheet from '../../components/MotionSheet.vue'
import { springSnappy, springSmooth, fadeSlide, staggerChildren } from '../../motion/presets'
import { rememberPaper, navigatePaper } from '../../motion/navigation'
import { useRouter } from 'vue-router'
import { showModal } from '../../utils/feedback'
import catalog from '../../data/catalog.json'
import { buildSections, paperTitle, missingSectionMessage, SECTION_DEFS } from '../../utils/paper.mjs'
import { getAppStorage, setAppStorage, bindNativeEvents, requestNativeExit } from '../../utils/native-runtime.js'
import { allProgress, loadPaper } from '../../utils/storage.js'
import audioCatalog from '../../data/audio.json'
const levels = [{ id: 'CET4', name: '四级', label: 'CET–4' }, { id: 'CET6', name: '六级', label: 'CET–6' }]
defineOptions({ name: 'HomePage' })
const router = useRouter()
const level = ref('CET4'), selectedYear = ref(0), progress = ref([]), storageError = ref(false)
const selectedPaper = ref(null), sections = ref([]), loading = ref(false), loadError = ref(false)
const displayedPaper = ref(null)
const sectionIcons = { cloze: 'TextSelect', matching: 'ListFilter', reading: 'BookOpen', listening: 'Headphones', writing: 'PenLine', translation: 'Languages' }
let unbindNative = () => {}
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
  try { setAppStorage('cet:level', value) } catch { /* Reading remains available. */ }
}
function sectionName(id) { return SECTION_DEFS.find(s => s.id === id)?.name || '' }
function paperAnswered(id) { return progress.value.filter(p => p.paperId === id).reduce((sum, p) => sum + (p.answered || 0), 0) }
function sectionProgress(section) {
  const record = progress.value.find(p => p.paperId === selectedPaper.value.id && p.sectionId === section.id)
  return record?.answered ? `已答 ${record.answered} / ${section.items.length}` : `${section.items.length} 题`
}
function closeSheet() { requestVersion++; selectedPaper.value = null }
async function selectPaper(paper, event) {
  displayedPaper.value = paper
  if (event) rememberPaper(paper, event)
  selectedPaper.value = paper; loading.value = true; loadError.value = false
  const version = ++requestVersion
  try { const data = await loadPaper(paper.id); if (version === requestVersion) sections.value = buildSections(data) }
  catch { if (version === requestVersion) loadError.value = true }
  finally { if (version === requestVersion) loading.value = false }
}
function openPractice(paperId, sectionId, event) {
  if (event) rememberPaper(catalog.find(paper => paper.id === paperId), event)
  const title = paperTitle(catalog.find(paper => paper.id === paperId))
  closeSheet()
  navigatePaper(() => router.push({ name: 'practice', query: { paper: paperId, section: sectionId } }), { title, subtitle: sectionName(sectionId) })
}
function selectSection(section) {
  if (!section.items.length) {
    const paperId = selectedPaper.value.id
    const audioOnly = section.id === 'listening' && Boolean(audioCatalog[paperId])
    showModal({
      title: '题目缺失',
      content: audioOnly ? `${missingSectionMessage(section)}也可单独播放本套听力音频。` : missingSectionMessage(section),
      showCancel: audioOnly, confirmText: audioOnly ? '播放音频' : '知道了', cancelText: '返回选题',
      success(result) { if (audioOnly && result.confirm) openPractice(paperId, section.id) },
    })
    return
  }
  openPractice(selectedPaper.value.id, section.id)
}
onActivated(() => {
  unbindNative()
  unbindNative = bindNativeEvents({ back() { if (selectedPaper.value) closeSheet(); else requestNativeExit() } })
  try {
    const savedLevel = getAppStorage('cet:level')
    if (levels.some(entry => entry.id === savedLevel)) setLevel(savedLevel)
    progress.value = allProgress(); storageError.value = false
  } catch { storageError.value = true }
})
onDeactivated(() => unbindNative())
onBeforeUnmount(() => unbindNative())
</script>

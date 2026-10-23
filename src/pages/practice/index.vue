<template>
  <view class="practice page" :style="{ '--reading-size': `${fontSize}px` }">
    <view class="practice-inner">
      <view class="practice-header">
        <button class="back-button" aria-label="返回真题" @click="goBack">‹</button>
        <view class="practice-heading"><text class="practice-title">{{ section?.name || '做题' }}</text><text v-if="paper" class="practice-subtitle">{{ paperTitle(paper) }}</text></view>
        <button class="practice-score-button" @click="openScore">评分</button><button class="font-button" aria-label="调整字号" @click="modal = 'font'">Aa</button>
      </view>
      <view v-if="loading" class="page-state"><text>正在读取试卷…</text></view>
      <view v-else-if="error" class="page-state"><text>{{ error }}</text><ListeningAudio v-if="unavailable && isListening && recording" ref="audioPlayer" :source="recording" :paper-id="paperId" :active="audioActive" /><button v-if="unavailable" class="primary-button" @click="goBack">返回真题</button><button v-else class="primary-button" @click="initialize">重新读取</button></view>
      <template v-else-if="current">
        <view class="progress-row"><text class="position">{{ isListening ? groupIndex + 1 : isCloze ? answered : currentIndex + 1 }}<text class="subtle"> / {{ isListening ? `${groups.length}组` : section.items.length }}</text></text><view class="progress-track"><view class="progress-fill" :style="{ width: `${answered / section.items.length * 100}%` }" /></view><text class="answered-count">已答 {{ answered }}</text></view>
        <view :class="['workspace', { 'text-workspace': current.kind === 'text', 'single-workspace': isCloze || isListening || isReading, 'reading-workspace': isReading, 'cloze-workspace': isCloze, 'listening-workspace': isListening }]">
          <view v-if="isListening" class="material-panel listening-group-panel">
            <view class="panel-heading"><text>第 {{ activeGroup.items[0].number }}—{{ activeGroup.items[activeGroup.items.length - 1].number }} 题</text><button class="text-button directions-toggle" @click="showDirections = !showDirections">{{ showDirections ? '收起说明' : '题目说明' }}</button></view>
            <ListeningAudio v-if="recording" ref="audioPlayer" :source="recording" :paper-id="paperId" :active="audioActive" />
            <text v-else class="resource-note">暂无听力音频，仅可查看试题</text>
            <view v-if="showDirections" class="directions"><text>{{ current.directions || '原卷未提供说明' }}</text></view>
            <scroll-view :key="activeGroup.key" class="group-question-scroll" scroll-y :scroll-into-view="scrollTarget" :show-scrollbar="false">
              <text class="lead-in">{{ activeGroup.items[0].leadIn }}</text>
              <text v-if="activeGroup.items[0].passage" class="reading-text listening-transcript">{{ activeGroup.items[0].passage }}</text>
              <view v-for="item in activeGroup.items" :id="`listening-question-${item.key}`" :key="item.key" class="listening-question">
                <view class="question-panel-heading"><text>第 {{ item.number }} 题</text><text :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</text></view>
                <text v-if="item.stem" class="question-stem">{{ item.stem }}</text>
                <QuestionOptions :item="item" :response="answers[item.key]" :revealed="Boolean(revealedItems[item.key])" :review="reviewFor(item)" @choose="chooseFor(item, $event)" />
                <button class="review-toggle" @click="revealedItems[item.key] = !revealedItems[item.key]">{{ revealedItems[item.key] ? '收起' : '查看答案与解析' }}</button>
                <AnswerReview v-if="revealedItems[item.key]" :review="reviewFor(item)" />
              </view>
            </scroll-view>
          </view>
          <template v-else>
            <view class="material-panel">
              <view class="panel-heading"><text>{{ materialLabel }}</text><view class="panel-actions"><button v-if="isCloze" class="text-button cloze-review-button" @click="modal = 'cloze-review'">查看答案</button><button class="text-button directions-toggle" @click="showDirections = !showDirections">{{ showDirections ? '收起说明' : '题目说明' }}</button></view></view>
              <view v-if="showDirections" class="directions"><text>{{ current.directions || '原卷未提供说明' }}</text></view>
              <view :key="materialKey" class="material-scroll">
                <text v-if="current.title" class="passage-title">{{ current.title }}</text>
                <template v-if="current.paragraphs"><view v-for="paragraph in current.paragraphs" :key="paragraph.label" class="labeled-paragraph"><text class="paragraph-label">{{ paragraph.label }}</text><text class="reading-text">{{ paragraph.text }}</text></view></template>
                <text v-else-if="isCloze" class="reading-text cloze-passage"><template v-for="(chunk, index) in clozeChunks" :key="index"><text v-if="chunk.item" :class="['cloze-blank', { filled: answers[chunk.item.key], active: current.key === chunk.item.key }]" role="button" tabindex="0" :data-blank="chunk.item.key" :aria-label="`第${chunk.item.number}空，${blankDisplay(chunk.item)}`" @click="openBlank(chunk.index)" @keydown.enter="openBlank(chunk.index)" @keydown.space.prevent="openBlank(chunk.index)">{{ blankDisplay(chunk.item) }}</text><text v-else>{{ chunk.text }}</text></template></text>
                <text v-else-if="current.passage" :class="['reading-text', { 'chinese-text': section.id === 'translation' }]">{{ current.passage }}</text>
                <text v-if="current.materials" class="reading-text task-material">{{ current.materials }}</text>
              </view>
              <view v-if="isCloze || isReading" class="cloze-save"><text :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</text></view>
            </view>
            <view v-if="!isCloze && !isReading" class="question-panel">
              <view class="question-panel-heading"><text>{{ current.kind === 'text' ? '作答' : `第 ${current.number} 题` }}</text><text :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</text></view>
              <text v-if="current.stem" class="question-stem">{{ current.stem }}</text>
              <template v-if="current.kind === 'text'">
                <textarea class="answer-input" :value="answers[current.key] || ''" :maxlength="-1" :auto-height="false" :adjust-position="true" placeholder="在这里写下你的答案…" @input="updateText" />
                <view class="word-count"><text v-if="current.wordLimit?.minimum">{{ current.wordLimit.minimum }}–{{ current.wordLimit.maximum }} 词</text><text>{{ wordCount }} 词</text></view>
              </template>
              <QuestionOptions v-else :item="current" :response="answers[current.key]" :section-id="section.id" :revealed="revealed" :review="review" @choose="chooseFor(current, $event)" />
              <button class="review-toggle" @click="revealed = !revealed">{{ revealed ? '收起' : current.kind === 'text' ? '查看答案' : '查看答案与解析' }}</button>
              <AnswerReview v-if="revealed" :review="review" />
              <view v-if="saveFailed" class="save-error"><text>进度未能保存，请检查设备存储空间</text><button class="text-button" @click="persist">重试保存</button></view>
            </view>
          </template>
          <view v-if="saveFailed && (isCloze || isListening || isReading)" class="save-error"><text>进度未能保存，请检查设备存储空间</text><button class="text-button" @click="persist">重试保存</button></view>
        </view>
        <button v-if="isReading" class="floating-answer-button" aria-label="打开全部题目" @click="openQuestions()"><view class="grid-icon"><view v-for="n in 4" :key="n" /></view><text>答题</text><text class="floating-answer-count">{{ answered }}/{{ section.items.length }}</text></button>
        <view class="practice-footer"><button class="answer-card-button" @click="modal = 'answers'"><view class="grid-icon"><view v-for="n in 4" :key="n" /></view><text>答题卡</text></button><view class="navigation-buttons"><button class="previous-button" :disabled="atStart && !previousSection" @click="previous">上一题</button><button class="primary-button next-button" @click="next">{{ atEnd && !nextSection ? '完成练习' : '下一题' }}<text v-if="!atEnd || nextSection">→</text></button></view></view>
      </template>
    </view>
    <view v-if="modal" :class="['overlay', { 'dropdown-overlay': modal === 'words' || modal === 'reading-questions' }]" @click="modal = ''"><view :class="['utility-sheet', { 'word-picker': modal === 'words', 'reading-picker': modal === 'reading-questions', 'cloze-review-sheet': modal === 'cloze-review' }]" @click.stop>
      <view class="sheet-handle" /><view class="sheet-top"><text class="sheet-title">{{ modalTitle }}</text><view class="sheet-controls"><button class="close-button" aria-label="关闭弹层" @click="modal = ''">×</button></view></view>
      <template v-if="modal === 'reading-questions'"><ReadingQuestions :items="section.items" :answers="answers" :paper="paper" :section-id="sectionId" :expanded-index="expandedQuestion" :revealed="revealed" @toggle="toggleReadingQuestion" @choose="answerReadingQuestion" @reveal="revealed = !revealed" /><view v-if="saveFailed" class="save-error"><text>进度未能保存</text><button class="text-button" @click="persist">重试保存</button></view></template>
      <template v-else-if="modal === 'answers'"><view class="answer-legend"><text>已答 {{ answered }} / {{ section.items.length }}</text><text>点击题号跳转</text></view><view class="answer-grid"><button v-for="(item, index) in section.items" :key="item.key" :class="['answer-number', { filled: isAnswered(item), current: index === currentIndex }]" @click="isCloze ? openBlank(index) : jump(index)"><text>{{ item.number }}</text><text v-if="item.kind !== 'text' && answers[item.key]" class="answer-number-choice">{{ answers[item.key] }}</text></button></view></template>
      <template v-else-if="modal === 'words'"><QuestionOptions :item="current" :response="answers[current.key]" section-id="cloze" @choose="fillBlank" /><button class="review-toggle" @click="revealed = !revealed">{{ revealed ? '收起' : '查看答案与解析' }}</button><AnswerReview v-if="revealed" :review="review" /></template>
      <template v-else-if="modal === 'cloze-review'"><view v-for="item in section.items" :key="item.key" class="cloze-review-item"><text class="review-label">第 {{ item.number }} 空</text><AnswerReview :review="reviewFor(item)" /></view></template>
      <view v-else-if="modal === 'font'" class="font-settings"><button v-for="size in [17, 19, 21]" :key="size" :class="['font-choice', { selected: fontSize === size }]" @click="setFont(size)"><text :style="{ fontSize: `${size}px` }">Aa</text><text>{{ size === 17 ? '标准' : size === 19 ? '舒适' : '大字' }}</text></button></view>
      <view v-else class="completion"><view class="completion-mark">✓</view><text class="completion-count">{{ answered }}<text> / {{ section.items.length }}</text></text><text class="completion-caption">已作答</text><button class="primary-button" @click="goBack">返回真题</button><button class="text-button" @click="modal = ''">继续做题</button></view>
    </view></view>
  </view>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import { onLoad, onShow, onHide, onUnload, onBackPress } from '@dcloudio/uni-app'
import { buildSections, countAnswered, paperTitle, missingSectionMessage, restoreProgress, listeningGroups, clozePassageChunks, nextAvailableSection, previousAvailableSection } from '../../utils/paper.mjs'
import { loadPaper, readProgress, saveProgress } from '../../utils/storage.js'
import catalog from '../../data/catalog.json'
import { answerReview } from '../../utils/solutions.mjs'
import audioCatalog from '../../data/audio.json'
import ListeningAudio from '../../components/ListeningAudio.vue'
import AnswerReview from '../../components/AnswerReview.vue'
import QuestionOptions from '../../components/QuestionOptions.vue'
import ReadingQuestions from '../../components/ReadingQuestions.vue'

const paper = ref(null), section = ref(null), currentIndex = ref(0), answers = ref({})
const loading = ref(true), error = ref(''), unavailable = ref(false), saveFailed = ref(false), showDirections = ref(false), modal = ref(''), fontSize = ref(19)
const revealed = ref(false)
const revealedItems = ref({}), scrollTarget = ref('')
const expandedQuestion = ref(null)
const audioPlayer = ref(null), audioActive = ref(true), recording = ref(null)
const startedAt = ref(0)
let paperId = '', sectionId = '', ready = false, requestedPosition = ''
const current = computed(() => section.value?.items[currentIndex.value])
const isCloze = computed(() => section.value?.id === 'cloze')
const isListening = computed(() => section.value?.id === 'listening')
const isReading = computed(() => ['matching', 'reading'].includes(section.value?.id))
const groups = computed(() => listeningGroups(section.value))
const groupIndex = computed(() => Math.max(0, groups.value.findIndex(group => group.items.some(item => item.key === current.value?.key))))
const activeGroup = computed(() => groups.value[groupIndex.value])
const nextSection = computed(() => paper.value ? nextAvailableSection(buildSections(paper.value), sectionId) : null)
const previousSection = computed(() => paper.value ? previousAvailableSection(buildSections(paper.value), sectionId) : null)
const atStart = computed(() => isReading.value || (isListening.value ? groupIndex.value === 0 : currentIndex.value === 0))
const atEnd = computed(() => isReading.value || isCloze.value || (isListening.value ? groupIndex.value === groups.value.length - 1 : currentIndex.value === section.value?.items.length - 1))
const modalTitle = computed(() => ({ answers: '答题卡', 'reading-questions': '全部题目', font: '阅读字号', words: `第 ${current.value?.number} 空`, 'cloze-review': '答案与解析', complete: '练习已保存' })[modal.value] || '')
const review = computed(() => current.value ? answerReview(paper.value, sectionId, current.value, answers.value[current.value.key]) : { status: 'missing' })
const answered = computed(() => countAnswered(section.value?.items || [], answers.value))
const wordCount = computed(() => (answers.value[current.value?.key] || '').trim().match(/\S+/g)?.length || 0)
const materialLabel = computed(() => sectionId === 'writing' ? '写作要求' : sectionId === 'translation' ? '翻译原文' : sectionId === 'listening' ? '听力材料' : '原文')
const materialKey = computed(() => current.value?.title || sectionId)
const clozeChunks = computed(() => clozePassageChunks(section.value))
function reviewFor(item) { return answerReview(paper.value, sectionId, item, answers.value[item.key]) }
function blankDisplay(item) { const option = item.options.find(option => option.label === answers.value[item.key]); return option ? `${option.label}) ${option.text}` : String(item.number) }
function openBlank(index) { currentIndex.value = index; revealed.value = false; modal.value = 'words'; persist() }
function fillBlank(label) { answers.value[current.value.key] = label; persist(); modal.value = ''; revealed.value = false }
function openQuestions(index = null) { expandedQuestion.value = index; revealed.value = false; modal.value = 'reading-questions' }
function toggleReadingQuestion(index) { currentIndex.value = index; expandedQuestion.value = expandedQuestion.value === index ? null : index; revealed.value = false; persist() }
function answerReadingQuestion({ item, label }) { chooseFor(item, label); expandedQuestion.value = null; revealed.value = false }
function isAnswered(item) { return countAnswered([item], answers.value) > 0 }
function persist() {
  if (!ready || !section.value) return false
  try {
    if (!startedAt.value && answered.value) startedAt.value = Date.now()
    saveProgress({ paperId, sectionId, startedAt: startedAt.value, currentIndex: currentIndex.value, answers: { ...answers.value }, answered: answered.value, total: section.value.items.length })
    saveFailed.value = false
    return true
  } catch { saveFailed.value = true; return false }
}
async function initialize() {
  loading.value = true; error.value = ''; unavailable.value = false; revealed.value = false; ready = false
  try {
    if (!catalog.some(p => p.id === paperId)) throw new Error('未找到这套真题')
    paper.value = await loadPaper(paperId)
    recording.value = sectionId === 'listening' ? audioCatalog[paperId] || null : null
    section.value = buildSections(paper.value).find(s => s.id === sectionId)
    if (!section.value) throw new Error('未找到该题型')
    if (!section.value.items.length) {
      unavailable.value = true
      error.value = missingSectionMessage(section.value)
      return
    }
    // Fail closed if storage cannot be read, so existing progress cannot be overwritten.
    const saved = readProgress(paperId, sectionId)
    const restored = restoreProgress(section.value, saved)
    startedAt.value = saved?.startedAt || (saved?.answered ? saved.updatedAt || Date.now() : 0)
    answers.value = restored.answers; currentIndex.value = restored.currentIndex
    if (requestedPosition === 'last') currentIndex.value = section.value.items.length - 1
    ready = true; persist()
    // The entry hint must not override later saved positions on a browser reload.
    // #ifdef H5
    if (requestedPosition === 'last') window.history.replaceState(window.history.state, '', window.location.href.replace(/&position=last(?=&|$)/, ''))
    // #endif
    requestedPosition = ''
    try { const size = uni.getStorageSync('cet:font'); if ([17, 19, 21].includes(size)) fontSize.value = size } catch { /* Default font is usable. */ }
  } catch (cause) { error.value = cause.message || '试卷或进度读取失败，请重试' }
  finally { loading.value = false }
}
function chooseFor(item, label) {
  if (!isReading.value && answers.value[item.key] === label) delete answers.value[item.key]
  else answers.value[item.key] = label
  currentIndex.value = section.value.items.findIndex(question => question.key === item.key)
  persist()
}
function updateText(event) { answers.value[current.value.key] = event.detail.value; persist() }
async function jump(index) {
  currentIndex.value = index; modal.value = ''; revealed.value = false; revealedItems.value = {}; scrollTarget.value = ''; persist()
  if (isListening.value) { await nextTick(); scrollTarget.value = `listening-question-${current.value.key}` }
  else if (isReading.value) openQuestions(index)
}
function move(delta) {
  if (isListening.value) { const group = groups.value[groupIndex.value + delta]; if (group) jump(group.startIndex) }
  else jump(Math.max(0, Math.min(currentIndex.value + delta, section.value.items.length - 1)))
}
function previous() {
  if (!atStart.value) {
    if (isCloze.value) openBlank(currentIndex.value - 1)
    else move(-1)
    return
  }
  if (previousSection.value) changeSection(previousSection.value.id, isReading.value ? '' : 'last')
}
function changeSection(id, position = '') {
  if (!persist()) return
  audioPlayer.value?.pause()
  uni.redirectTo({ url: `/pages/practice/index?paper=${encodeURIComponent(paperId)}&section=${id}${position ? `&position=${position}` : ''}`, fail: () => uni.showToast({ title: '跳转失败，请重试', icon: 'none' }) })
}
function next() {
  if (!atEnd.value) { move(1); return }
  if (!persist()) return
  if (!nextSection.value) { modal.value = 'complete'; return }
  changeSection(nextSection.value.id)
}
function setFont(size) { fontSize.value = size; try { uni.setStorageSync('cet:font', size) } catch { /* Font choice is still effective this session. */ } }
function openScore() {
  if (!ready || !persist()) return
  audioPlayer.value?.pause()
  uni.navigateTo({ url: `/pages/score/index?paper=${encodeURIComponent(paperId)}` })
}
function goBack() {
  if (ready && !persist()) { uni.showToast({ title: '保存失败，请重试保存', icon: 'none' }); return }
  if (getCurrentPages().length < 2) { uni.reLaunch({ url: '/pages/index/index' }); return }
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}
onLoad(options => { paperId = options.paper || ''; sectionId = options.section || ''; requestedPosition = options.position || ''; initialize() })
onShow(() => { audioActive.value = true })
onHide(() => { audioActive.value = false; audioPlayer.value?.pause(); persist() })
onUnload(() => { audioActive.value = false; audioPlayer.value?.pause(); persist() })
onBackPress(event => {
  if (modal.value) { modal.value = ''; return true }
  if (ready && !persist()) { uni.showToast({ title: '保存失败，请重试保存', icon: 'none' }); return true }
  return false
})
</script>

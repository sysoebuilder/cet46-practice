<template>
  <MotionConfig reduced-motion="user" :transition="springSnappy">
  <div class="practice page" :style="{ '--reading-size': `${fontSize}px` }">
    <motion.div class="practice-inner" role="main" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="fadeSlide">
      <div class="practice-header">
        <MotionButton class="back-button" aria-label="返回真题" @click="goBack"><AppIcon name="ChevronLeft" :size="23" /></MotionButton>
        <div class="practice-heading"><span class="practice-title">{{ section?.name || '做题' }}</span><span v-if="paper" class="practice-subtitle">{{ paperTitle(paper) }}</span></div>
        <div class="practice-header-actions"><MotionButton class="font-button" aria-label="调整字号" @click="modal = 'font'">Aa</MotionButton><template v-if="!loading && !error && current"><MotionButton v-if="!checked" class="check-answers-button" @click="checkAnswers">核对答案</MotionButton><MotionButton v-else class="redo-button" @click="redoSection">重做</MotionButton></template></div>
      </div>
      <div v-if="loading" class="page-state"><LoadingState /></div>
      <div v-else-if="error" class="page-state"><span>{{ error }}</span><ListeningAudio v-if="unavailable && isListening && recording" ref="audioPlayer" :source="recording" :paper-id="paperId" :active="audioActive" /><MotionButton v-if="unavailable" class="primary-button" @click="goBack">返回真题</MotionButton><MotionButton v-else class="primary-button" @click="initialize">重新读取</MotionButton></div>
      <template v-else-if="current">
        <div class="progress-row"><span class="position">{{ isListening ? groupIndex + 1 : isCloze ? answered : currentIndex + 1 }}<span class="subtle"> / {{ isListening ? `${groups.length}组` : section.items.length }}</span></span><div class="progress-track"><motion.div class="progress-fill" :initial="false" :animate="{ scaleX: answered / section.items.length }" :transition="reduced ? { duration: 0 } : springSmooth" /></div><span class="answered-count">已答 {{ answered }}</span></div>
        <div :class="['workspace', { 'text-workspace': current.kind === 'text', 'single-workspace': isCloze || isListening || isReading, 'reading-workspace': isReading, 'cloze-workspace': isCloze, 'listening-workspace': isListening }]">
          <div v-if="isListening" class="material-panel listening-group-panel">
            <div class="panel-heading"><span>第 {{ activeGroup.items[0].number }}—{{ activeGroup.items[activeGroup.items.length - 1].number }} 题</span><MotionButton class="text-button directions-toggle" @click="showDirections = !showDirections">{{ showDirections ? '收起说明' : '题目说明' }}</MotionButton></div>
            <ListeningAudio v-if="recording" ref="audioPlayer" :source="recording" :paper-id="paperId" :active="audioActive" />
            <span v-else class="resource-note">暂无听力音频，仅可查看试题</span>
            <div v-if="showDirections" class="directions"><span>{{ current.directions || '原卷未提供说明' }}</span></div>
            <AnimatePresence mode="wait" :custom="direction" :initial="false"><motion.div :key="activeGroup.key" class="group-motion" :custom="direction" :variants="slideVariants" initial="enter" animate="visible" exit="exit" :transition="fadeSlide"><ScrollArea class="group-question-scroll" scroll-y :scroll-into-view="scrollTarget" :show-scrollbar="false">
              <span class="lead-in">{{ activeGroup.items[0].leadIn }}</span>
              <span v-if="activeGroup.items[0].passage" class="reading-text listening-transcript">{{ activeGroup.items[0].passage }}</span>
              <div v-for="item in activeGroup.items" :id="`listening-question-${item.key}`" :key="item.key" :class="['listening-question', checked ? `checked-${reviewFor(item).status}` : '']">
                <div class="question-panel-heading"><span>第 {{ item.number }} 题</span><span :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</span></div>
                <span v-if="item.stem" class="question-stem">{{ item.stem }}</span>
                <QuestionOptions :item="item" :response="answers[item.key]" :revealed="checked" :review="reviewFor(item)" @choose="chooseFor(item, $event)" />
                <AnswerResult v-if="checked" :review="reviewFor(item)" :number="item.number" @explain="openExplanation(item)" />
              </div>
            </ScrollArea></motion.div></AnimatePresence>
          </div>
          <template v-else>
            <div class="material-panel">
              <div class="panel-heading"><span>{{ materialLabel }}</span><div class="panel-actions"><MotionButton class="text-button directions-toggle" @click="showDirections = !showDirections">{{ showDirections ? '收起说明' : '题目说明' }}</MotionButton></div></div>
              <div v-if="showDirections" class="directions"><span>{{ current.directions || '原卷未提供说明' }}</span></div>
              <AnimatePresence mode="wait" :custom="direction"><motion.div :key="materialKey" class="material-scroll" :custom="direction" :variants="slideVariants" initial="enter" animate="visible" exit="exit" :transition="{ ...fadeSlide, delay: 0.025 }">
                <span v-if="current.title" class="passage-title">{{ current.title }}</span>
                <template v-if="current.paragraphs"><div v-for="paragraph in current.paragraphs" :key="paragraph.label" class="labeled-paragraph"><span class="paragraph-label">{{ paragraph.label }}</span><span class="reading-text">{{ paragraph.text }}</span></div></template>
                <div v-else-if="isCloze" class="reading-text cloze-passage"><template v-for="(chunk, index) in clozeChunks" :key="index"><template v-if="chunk.item"><motion.span :while-press="reduced ? undefined : { scale: 0.95 }" :transition="springSnappy" :class="['cloze-blank', { filled: answers[chunk.item.key], active: current.key === chunk.item.key }, checked ? `checked-${reviewFor(chunk.item).status}` : '']" role="button" tabindex="0" :data-blank="chunk.item.key" :aria-label="`第${chunk.item.number}空，${blankDisplay(chunk.item)}`" @click="activateBlank(chunk.index, $event)" @keydown.enter="activateBlank(chunk.index, $event)" @keydown.space.prevent="activateBlank(chunk.index, $event)"><AnimatePresence mode="wait" :initial="false"><motion.span :key="answers[chunk.item.key] || 'empty'" class="blank-word" :initial="{ opacity: 0, y: reduced ? 0 : 4 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0, y: reduced ? 0 : -3 }" :transition="fadeSlide">{{ blankDisplay(chunk.item) }}</motion.span></AnimatePresence><span v-if="checked"> {{ resultMark(chunk.item) }}</span></motion.span><span v-if="checked && reviewFor(chunk.item).answer && reviewFor(chunk.item).status !== 'correct'" class="cloze-correction" role="button" tabindex="0" :data-correction="chunk.item.key" @click="openExplanation(chunk.item)" @keydown.enter="openExplanation(chunk.item)">正确：{{ reviewFor(chunk.item).answer }}) {{ reviewFor(chunk.item).answerText }}</span></template><span v-else>{{ chunk.text }}</span></template></div>
                <span v-else-if="current.passage" :class="['reading-text', { 'chinese-text': section.id === 'translation' }]">{{ current.passage }}</span>
                <span v-if="current.materials" class="reading-text task-material">{{ current.materials }}</span>
              </motion.div></AnimatePresence>
              <div v-if="isCloze || isReading" class="cloze-save"><span :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</span></div>
            </div>
            <AnimatePresence mode="wait" :custom="direction" :initial="false"><motion.div v-if="!isCloze && !isReading" :key="current.key" class="question-panel" :custom="direction" :variants="slideVariants" initial="enter" animate="visible" exit="exit" :transition="fadeSlide">
              <div class="question-panel-heading"><span>{{ current.kind === 'text' ? '作答' : `第 ${current.number} 题` }}</span><span :class="['save-state', { 'save-failed': saveFailed }]">{{ saveFailed ? '保存失败' : '已自动保存' }}</span></div>
              <span v-if="current.stem" class="question-stem">{{ current.stem }}</span>
              <template v-if="current.kind === 'text'">
                <textarea class="answer-input" :value="answers[current.key] || ''" :disabled="checked" placeholder="在这里写下你的答案…" @input="updateText" />
                <div class="word-count"><span v-if="current.wordLimit?.minimum">{{ current.wordLimit.minimum }}–{{ current.wordLimit.maximum }} 词</span><span>{{ wordCount }} 词</span></div>
              </template>
              <QuestionOptions v-else :item="current" :response="answers[current.key]" :section-id="section.id" :revealed="checked" :review="review" @choose="chooseFor(current, $event)" />
              <AnswerResult v-if="checked" :review="review" :number="current.number" @explain="openExplanation(current)" />
              <div v-if="saveFailed" class="save-error"><span>进度未能保存，请检查设备存储空间</span><MotionButton class="text-button" @click="persist">重试保存</MotionButton></div>
            </motion.div></AnimatePresence>
          </template>
          <div v-if="saveFailed && (isCloze || isListening || isReading)" class="save-error"><span>进度未能保存，请检查设备存储空间</span><MotionButton class="text-button" @click="persist">重试保存</MotionButton></div>
        </div>
        <MotionButton v-if="isReading" class="floating-answer-button" aria-label="打开全部题目" @click="openQuestions()"><AppIcon name="Grid2X2" :size="19" /><span>{{ checked ? '核对结果' : '答题' }}</span><span class="floating-answer-count">{{ answered }}/{{ section.items.length }}</span></MotionButton>
        <div class="practice-footer"><MotionButton class="answer-card-button" @click="modal = 'answers'"><AppIcon name="Grid2X2" :size="19" /><span>答题卡</span></MotionButton><div class="navigation-buttons"><MotionButton class="previous-button" :disabled="atStart && !previousSection" @click="previous">上一题</MotionButton><MotionButton class="primary-button next-button" @click="next">{{ atEnd && !nextSection ? '完成练习' : '下一题' }}<AppIcon v-if="!atEnd || nextSection" name="ArrowRight" :size="18" /></MotionButton></div></div>
      </template>
    </motion.div>
    <MotionSheet :reading-size="fontSize" :open="Boolean(modal)" :title="modalTitle" :popover="displayedModal === 'words'" :anchor="blankAnchor" :panel-class="['utility-sheet', { 'word-picker': displayedModal === 'words', 'reading-picker': displayedModal === 'reading-questions', 'explanation-sheet': displayedModal === 'explanation', 'results-sheet': displayedModal === 'results' }]" @close="closeModal">
      <template v-if="displayedModal === 'reading-questions'"><ReadingQuestions :items="section.items" :answers="answers" :paper="paper" :section-id="sectionId" :expanded-index="expandedQuestion" :checked="checked" @toggle="toggleReadingQuestion" @choose="answerReadingQuestion" @explain="openExplanation" /><div v-if="saveFailed" class="save-error"><span>进度未能保存</span><MotionButton class="text-button" @click="persist">重试保存</MotionButton></div></template>
      <template v-else-if="displayedModal === 'answers'">
        <div class="answer-legend"><span>已答 {{ answered }} / {{ section.items.length }}</span><span>点击题号跳转</span></div>
        <div class="answer-grid">
          <MotionButton v-for="(item, index) in section.items" :key="item.key" :class="['answer-number', { filled: isAnswered(item), current: index === currentIndex }, checked ? `checked-${reviewFor(item).status}` : '']" @click="isCloze ? activateBlank(index) : jump(index)">
            <span class="answer-number-label">{{ item.number }}</span>
            <div class="answer-number-meta">
              <span v-if="item.kind !== 'text' && answers[item.key]" class="answer-number-choice">{{ answers[item.key] }}</span>
              <span v-if="checked" class="answer-number-result">{{ resultMark(item) }}</span>
            </div>
          </MotionButton>
        </div>
      </template>
      <template v-else-if="displayedModal === 'results'">
        <div class="result-overview"><div><span v-if="current.kind !== 'text'" class="result-total">{{ correctCount }}<span> / {{ gradableCount }}</span></span><span v-else class="result-reference-heading">自行对照</span><span class="result-overview-label">{{ current.kind === 'text' ? '查看参考，保留你的作答' : '答对题数 / 可核对题数' }}</span></div><AppIcon :name="current.kind === 'text' ? 'BookOpen' : 'Check'" :size="30" /></div>
        <div class="result-filter"><div><span>未答 {{ section.items.length - answered }} · 已答 {{ answered }}</span><span v-if="current.kind !== 'text' && gradableCount < section.items.length" class="result-missing-note">答案缺失 {{ section.items.length - gradableCount }} 题</span></div><MotionButton v-if="current.kind !== 'text'" :class="['mistake-toggle', { selected: onlyMistakes }]" :aria-pressed="onlyMistakes" @click="onlyMistakes = !onlyMistakes">仅看错题</MotionButton></div>
        <div class="result-list"><div v-for="item in resultItems" :key="item.key" class="result-list-entry"><span class="result-item-number">第 {{ item.number }} 题</span><AnswerResult :review="reviewFor(item)" :number="item.number" @explain="openExplanation(item)" /></div><span v-if="!resultItems.length" class="empty-note">本题型没有错题</span></div>
      </template>
      <template v-else-if="displayedModal === 'words'"><QuestionOptions :item="current" :response="answers[current.key]" section-id="cloze" @choose="fillBlank" /></template>
      <template v-else-if="displayedModal === 'explanation' && explanationItem"><span v-if="answers[explanationItem.key]" class="explanation-response">你的答案：{{ responseDisplay(explanationItem) }}</span><AnswerReview :review="reviewFor(explanationItem)" /></template>
      <div v-else-if="displayedModal === 'font'" class="font-settings"><MotionButton v-for="size in [17, 19, 21]" :key="size" :class="['font-choice', { selected: fontSize === size }]" @click="setFont(size)"><span :style="{ fontSize: `${size}px` }">Aa</span><span>{{ size === 17 ? '标准' : size === 19 ? '舒适' : '大字' }}</span></MotionButton></div>
      <div v-else class="completion"><div class="completion-mark">✓</div><span class="completion-count">{{ answered }}<span> / {{ section.items.length }}</span></span><span class="completion-caption">已作答</span><MotionButton class="primary-button" @click="goBack">返回真题</MotionButton><MotionButton class="text-button" @click="modal = ''">继续做题</MotionButton></div>
    </MotionSheet>
  </div>
  </MotionConfig>
</template>

<script setup>
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { motion, MotionConfig, AnimatePresence, useReducedMotion } from 'motion-v'
import MotionSheet from '../../components/MotionSheet.vue'
import LoadingState from '../../components/LoadingState.vue'
import { springSnappy, springSmooth, fadeSlide, contentVariants } from '../../motion/presets'
import { navigatePaper, questionDirection } from '../../motion/navigation'
import { useRouter, useRoute, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { returnHome } from '../../router'
import { showToast } from '../../utils/feedback'
import { buildSections, countAnswered, paperTitle, missingSectionMessage, restoreProgress, listeningGroups, clozePassageChunks, nextAvailableSection, previousAvailableSection } from '../../utils/paper.mjs'
import { getAppStorage, setAppStorage, bindNativeEvents } from '../../utils/native-runtime.js'
import { loadPaper, readProgress, saveProgress } from '../../utils/storage.js'
import catalog from '../../data/catalog.json'
import { answerReview } from '../../utils/solutions.mjs'
import audioCatalog from '../../data/audio.json'
import ListeningAudio from '../../components/ListeningAudio.vue'
import AnswerReview from '../../components/AnswerReview.vue'
import AnswerResult from '../../components/AnswerResult.vue'
import QuestionOptions from '../../components/QuestionOptions.vue'
import ReadingQuestions from '../../components/ReadingQuestions.vue'

const reduced = useReducedMotion()
const router = useRouter(), route = useRoute()
const direction = ref(questionDirection.value), blankAnchor = ref(null), displayedModal = ref(''), onlyMistakes = ref(false)
const slideVariants = contentVariants(reduced)
const paper = ref(null), section = ref(null), currentIndex = ref(0), answers = ref({})
const loading = ref(true), error = ref(''), unavailable = ref(false), saveFailed = ref(false), showDirections = ref(false), modal = ref(''), fontSize = ref(19)
watch(modal, value => { if (value) displayedModal.value = value })
const checked = ref(false), explanationItem = ref(null), explanationReturn = ref('')
const scrollTarget = ref('')
const expandedQuestion = ref(null)
const audioPlayer = ref(null), audioActive = ref(true), recording = ref(null)
const startedAt = ref(0)
let unbindNative = () => {}
let paperId = '', sectionId = '', ready = false, requestedPosition = '', sectionNavigating = false
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
const modalTitle = computed(() => ({ results: '核对结果', answers: '答题卡', 'reading-questions': checked.value ? '核对结果' : '全部题目', font: '阅读字号', words: `第 ${current.value?.number} 空`, explanation: explanationItem.value?.kind === 'text' ? '参考答案' : `第 ${explanationItem.value?.number} 题解析`, complete: '练习已保存' })[displayedModal.value] || '')
const review = computed(() => current.value ? answerReview(paper.value, sectionId, current.value, answers.value[current.value.key]) : { status: 'missing' })
const correctCount = computed(() => section.value?.items.filter(item => reviewFor(item).status === 'correct').length || 0)
const gradableCount = computed(() => section.value?.items.filter(item => Boolean(reviewFor(item).answer)).length || 0)
const resultItems = computed(() => (section.value?.items || []).filter(item => !onlyMistakes.value || ['incorrect', 'unanswered'].includes(reviewFor(item).status)))
const answered = computed(() => countAnswered(section.value?.items || [], answers.value))
const wordCount = computed(() => (answers.value[current.value?.key] || '').trim().match(/\S+/g)?.length || 0)
const materialLabel = computed(() => sectionId === 'writing' ? '写作要求' : sectionId === 'translation' ? '翻译原文' : sectionId === 'listening' ? '听力材料' : '原文')
const materialKey = computed(() => current.value?.title || sectionId)
const clozeChunks = computed(() => clozePassageChunks(section.value))
function reviewFor(item) { return answerReview(paper.value, sectionId, item, answers.value[item.key]) }
function blankDisplay(item) { const option = item.options.find(option => option.label === answers.value[item.key]); return option ? `${option.label}) ${option.text}` : String(item.number) }
function responseDisplay(item) { const option = item.options?.find(option => option.label === answers.value[item.key]); return option ? `${option.label}${option.text ? ` · ${option.text}` : ''}` : answers.value[item.key] }
function resultMark(item) { return { correct: '✓', incorrect: '×', unanswered: '未答', missing: '答案缺失', reference: '对照' }[reviewFor(item).status] }
function activateBlank(index, event) { if (checked.value) openExplanation(section.value.items[index]); else openBlank(index, event) }
function openBlank(index, event) { currentIndex.value = index; blankAnchor.value = event?.currentTarget || document.querySelector(`[data-blank="${section.value.items[index].key}"]`); modal.value = 'words'; persist() }
function fillBlank(label) { if (checked.value) return; answers.value[current.value.key] = label; persist(); modal.value = '' }
function openQuestions(index = null) { expandedQuestion.value = index; modal.value = 'reading-questions' }
function toggleReadingQuestion(index) { currentIndex.value = index; expandedQuestion.value = expandedQuestion.value === index ? null : index; persist() }
function answerReadingQuestion({ item, label }) { if (checked.value) return; chooseFor(item, label); expandedQuestion.value = null }
function openExplanation(item) {
  if (!checked.value) return
  explanationReturn.value = ['reading-questions', 'results'].includes(modal.value) ? modal.value : ''
  explanationItem.value = item; modal.value = 'explanation'
}
function closeModal() { modal.value = modal.value === 'explanation' ? explanationReturn.value : ''; explanationReturn.value = '' }
function checkAnswers() {
  if (!ready) return
  checked.value = true
  if (!persist()) { checked.value = false; return }
  onlyMistakes.value = false
  if (isReading.value) openQuestions()
  else modal.value = 'results'
}
function redoSection() {
  if (!ready || !checked.value) return
  const previous = { answers: answers.value, index: currentIndex.value, startedAt: startedAt.value }
  answers.value = {}; currentIndex.value = 0; startedAt.value = 0; checked.value = false
  if (!persist()) {
    answers.value = previous.answers; currentIndex.value = previous.index; startedAt.value = previous.startedAt; checked.value = true
    return
  }
  modal.value = ''; expandedQuestion.value = null; explanationItem.value = null; scrollTarget.value = ''
}
function isAnswered(item) { return countAnswered([item], answers.value) > 0 }
function persist() {
  if (!ready || !section.value) return false
  try {
    if (!startedAt.value && answered.value) startedAt.value = Date.now()
    saveProgress({ paperId, sectionId, startedAt: startedAt.value, currentIndex: currentIndex.value, checked: checked.value, answers: { ...answers.value }, answered: answered.value, total: section.value.items.length })
    saveFailed.value = false
    return true
  } catch { saveFailed.value = true; return false }
}
async function initialize() {
  loading.value = true; error.value = ''; unavailable.value = false; checked.value = false; ready = false
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
    checked.value = saved?.checked === true
    startedAt.value = saved?.startedAt || (saved?.answered ? saved.updatedAt || Date.now() : 0)
    answers.value = restored.answers; currentIndex.value = restored.currentIndex
    if (requestedPosition === 'last') currentIndex.value = section.value.items.length - 1
    ready = true; persist()
    // The entry hint must not override later saved positions on a browser reload.
    if (requestedPosition === 'last') window.history.replaceState(window.history.state, '', window.location.href.replace(/&position=last(?=&|$)/, ''))
    requestedPosition = ''
    try { const size = getAppStorage('cet:font'); if ([17, 19, 21].includes(size)) fontSize.value = size } catch { /* Default font is usable. */ }
  } catch (cause) { error.value = cause.message || '试卷或进度读取失败，请重试' }
  finally { loading.value = false }
}
function chooseFor(item, label) {
  if (checked.value) return
  if (!isReading.value && answers.value[item.key] === label) delete answers.value[item.key]
  else answers.value[item.key] = label
  currentIndex.value = section.value.items.findIndex(question => question.key === item.key)
  persist()
}
function updateText(event) { if (checked.value) return; answers.value[current.value.key] = event.target.value; persist() }
async function jump(index) {
  direction.value = index >= currentIndex.value ? 1 : -1
  currentIndex.value = index; modal.value = ''; scrollTarget.value = ''; persist()
  if (isListening.value) { await nextTick(); scrollTarget.value = `listening-question-${current.value.key}` }
  else if (isReading.value) openQuestions(index)
}
function move(delta) {
  direction.value = delta
  if (isListening.value) { const group = groups.value[groupIndex.value + delta]; if (group) jump(group.startIndex) }
  else jump(Math.max(0, Math.min(currentIndex.value + delta, section.value.items.length - 1)))
}
function previous() {
  direction.value = -1
  if (!atStart.value) {
    if (isCloze.value) openBlank(currentIndex.value - 1)
    else move(-1)
    return
  }
  if (previousSection.value) changeSection(previousSection.value.id, isReading.value ? '' : 'last')
}
function changeSection(id, position = '') {
  if (sectionNavigating) return
  if (!persist()) return
  sectionNavigating = true
  questionDirection.value = direction.value
  audioPlayer.value?.pause()
  router.replace({ name: 'practice', query: { paper: paperId, section: id, ...(position ? { position } : {}) } }).catch(() => { sectionNavigating = false; showToast('跳转失败，请重试') })
}
function next() {
  direction.value = 1
  if (!atEnd.value) { move(1); return }
  if (!persist()) return
  if (!nextSection.value) { modal.value = 'complete'; return }
  changeSection(nextSection.value.id)
}
function setFont(size) { fontSize.value = size; try { setAppStorage('cet:font', size) } catch { /* Font choice is still effective this session. */ } }
function goBack() {
  if (ready && !persist()) { showToast('保存失败，请重试保存'); return }
  navigatePaper(returnHome, { reverse: true, title: paper.value ? paperTitle(paper.value) : '真题', subtitle: section.value?.name || '' })
}
onMounted(() => {
  paperId = String(route.query.paper || ''); sectionId = String(route.query.section || ''); requestedPosition = String(route.query.position || ''); initialize()
  audioActive.value = true
  unbindNative()
  unbindNative = bindNativeEvents({
    back() { if (modal.value) closeModal(); else goBack() },
    hide() { audioActive.value = false; audioPlayer.value?.pause(); persist() },
    show() { audioActive.value = true },
  })
})
onBeforeUnmount(() => { unbindNative(); audioActive.value = false; audioPlayer.value?.pause(); persist() })
function canLeave() {
  if (ready && !persist()) { showToast('保存失败，请重试保存'); return false }
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
</script>

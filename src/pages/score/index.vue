<template>
  <view class="score-page page"><view class="record-inner">
    <view class="practice-header"><button class="back-button" aria-label="返回" @click="back">‹</button><view class="practice-heading"><text class="practice-title">{{ snapshot ? '历史评分' : '真题评分' }}</text><text v-if="paper" class="practice-subtitle">{{ paper.level === 'CET4' ? '四级' : '六级' }} · {{ paperTitle(paper) }}</text></view></view>
    <view v-if="loading" class="page-state">正在读取作答…</view>
    <view v-else-if="error" class="page-state"><text>{{ error }}</text><button class="secondary-button" @click="initialize">重新读取</button></view>
    <template v-else-if="summary">
      <view class="score-overview"><text class="score-eyebrow">{{ summary.complete ? '练习估分' : '练习估分 · 部分待评' }}</text><view class="score-total"><text class="estimated-score">{{ summary.estimatedScore.toFixed(1) }}</text><text class="score-denominator"> / 710</text></view><text class="score-note">按官方题型权重折算，非官方报道分</text><text v-if="!summary.complete" class="score-pending">待评部分未计入，最高可至 {{ summary.possibleScore.toFixed(1) }} 分</text><view class="score-counts"><text>客观题对 {{ summary.correct }}</text><text>错 {{ summary.wrong }}（含空 {{ summary.blank }}）</text></view><text v-if="snapshot" class="score-snapshot-time">评分于 {{ historyTime(snapshot.createdAt) }}</text></view>
      <view class="score-breakdown"><view v-for="section in summary.sections" :key="section.id" class="score-section">
        <view class="score-section-top"><text class="score-section-name">{{ section.name }}<text class="score-section-weight">{{ section.weight }}%</text></text><text class="section-estimate">{{ section.estimated.toFixed(1) }}<text> / {{ section.maximum.toFixed(1) }}</text></text></view>
        <view v-if="section.start" class="score-section-detail"><text>对 {{ section.correct }} · 错 {{ section.wrong }} · 空 {{ section.blank }}</text><text v-if="section.missingAnswers">{{ section.missingAnswers }} 题答案缺失待判</text><text v-if="section.missingQuestions">{{ section.missingQuestions }} 题原题缺失</text></view>
        <template v-else><text v-if="section.missingQuestions" class="score-section-detail">原题缺失，待评</text><text v-else-if="section.blank" class="score-section-detail">未作答，计 0 分</text><view v-else-if="!snapshot" class="self-score-row"><text>自评</text><input :class="['self-score-input', { invalid: invalidSelfScore(section.id) }]" type="digit" :value="selfScores[section.id] ?? ''" placeholder="0–15" :aria-label="`${section.name}自评`" @input="selfScores[section.id] = $event.detail.value; saved = false" /><text>/ 15</text><text v-if="invalidSelfScore(section.id)" class="self-score-error">请输入 0–15</text><text v-else-if="section.pending" class="score-small-label">未填则待评</text></view><text v-else class="score-section-detail">{{ section.pending ? '尚未自评' : `自评 ${section.score} / 15` }}</text></template>
      </view></view>
      <view v-if="summary.missingQuestions || summary.missingAnswers" class="score-data-note">缺少原题或已答题的答案时保留待判，不作为答错。</view>
      <view class="score-main-actions"><button v-if="!snapshot" class="primary-button save-score-button" :disabled="saving || hasInvalidSelfScore" @click="grade">{{ saving ? '正在保存…' : saved ? '再次评分并保存' : '评分并保存' }}</button><button v-else class="primary-button current-score-button" @click="openCurrent">返回当前作答评分</button><text v-if="saved" class="grade-saved">已保存到历史</text><text v-if="saveError" class="grade-error">{{ saveError }}</text></view>
      <view v-if="records.length" class="score-records"><text class="record-section-title">评分记录</text><button v-for="record in records" :key="record.id" class="score-record-row" @click="viewRecord(record)"><view><text>{{ historyTime(record.createdAt) }}</text><text class="score-small-label">{{ record.summary.complete ? '练习估分' : '部分估分' }} · 已答 {{ record.summary.answered }}/57</text></view><text>{{ record.summary.estimatedScore.toFixed(1) }} ›</text></button></view>
      <button class="scoring-rule-toggle text-button" @click="showRules = !showRules">{{ showRules ? '收起计分规则' : '计分规则' }}</button>
      <view v-if="showRules" class="scoring-rules"><text>听力 35%、阅读 35%、写作 15%、翻译 15%。听力第 1–15 题每题占 1%，第 16–25 题每题占 2%；选词填空每题占 0.5%，长篇阅读每题占 1%，仔细阅读每题占 2%。</text><text>未作答计 0 分，可随时评分。作文、翻译各按 0–15 分自评，五档为 13–15、10–12、7–9、4–6、1–3 分，未填自评分则保留待评。</text><text>官方 710 分经过加权、等值和常模转换，本地无法精确还原；此处将加权卷面分线性折算为练习估分。评分记录保留当时的作答与自评分，之后修改不会改变旧记录。</text><view v-for="source in SCORE_SOURCES" :key="source.url" class="score-source"><text>{{ source.title }}</text><text class="source-url" selectable>{{ source.url }}</text></view></view>
    </template>
  </view></view>
</template>
<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import catalog from '../../data/catalog.json'
import { allProgress, loadPaper, readScores, saveScore } from '../../utils/storage.js'
import { paperTitle } from '../../utils/paper.mjs'
import { historyTime } from '../../utils/history.mjs'
import { paperResponses, scorePaper, makeScoreRecord, validSelfScore, reusableSelfScores, SCORE_SOURCES } from '../../utils/scoring.mjs'
const paper = ref(null), responses = ref({}), selfScores = ref({}), records = ref([]), snapshot = ref(null)
const loading = ref(true), error = ref(''), saveError = ref(''), saving = ref(false), saved = ref(false), showRules = ref(false)
let paperId = '', recordId = ''
const summary = computed(() => snapshot.value?.summary || (paper.value ? scorePaper(paper.value, responses.value, selfScores.value) : null))
function invalidSelfScore(id) { const value = selfScores.value[id]; return value !== '' && value !== null && value !== undefined && !validSelfScore(value) }
const hasInvalidSelfScore = computed(() => ['writing', 'translation'].some(invalidSelfScore))
async function initialize() {
  loading.value = true; error.value = ''; saved.value = false; saveError.value = ''
  try {
    if (!catalog.some(paper => paper.id === paperId)) throw new Error('未找到这套真题')
    paper.value = await loadPaper(paperId)
    records.value = readScores(paperId)
    snapshot.value = recordId ? records.value.find(record => record.id === recordId) : null
    if (recordId && !snapshot.value) throw new Error('未找到这条评分记录')
    responses.value = snapshot.value?.responses || paperResponses(paper.value, allProgress())
    selfScores.value = snapshot.value?.selfScores || reusableSelfScores(records.value[0], responses.value)
  } catch (cause) { error.value = cause.message || '作答读取失败' }
  finally { loading.value = false }
}
function grade() {
  if (saving.value || hasInvalidSelfScore.value || snapshot.value) return
  saving.value = true; saveError.value = ''
  try {
    const record = makeScoreRecord(paper.value, responses.value, selfScores.value)
    saveScore(record)
    records.value = readScores(paperId); saved.value = true
  } catch { saveError.value = '评分保存失败，请检查存储空间后重试'; saved.value = false }
  finally { saving.value = false }
}
function viewRecord(record) { uni.navigateTo({ url: `/pages/score/index?paper=${encodeURIComponent(paperId)}&record=${encodeURIComponent(record.id)}` }) }
function openCurrent() { uni.redirectTo({ url: `/pages/score/index?paper=${encodeURIComponent(paperId)}` }) }
function back() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.reLaunch({ url: '/pages/index/index' }) }
onLoad(options => { paperId = options.paper || ''; recordId = options.record || '' })
onShow(initialize)
</script>

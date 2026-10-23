<template>
  <view class="history-page page"><view class="record-inner">
    <view class="practice-header"><button class="back-button" aria-label="返回真题" @click="back">‹</button><text class="practice-title">做题历史</text><text class="history-count">{{ entries.length }} 套</text></view>
    <view v-if="error" class="page-state"><text>{{ error }}</text><button class="secondary-button" @click="refresh">重新读取</button></view>
    <view v-else-if="!entries.length" class="page-state"><text>还没有做题记录</text><button class="primary-button" @click="back">去做题</button></view>
    <view v-else class="history-list"><view v-for="entry in entries" :key="entry.paper.id" class="history-card">
      <view class="history-card-top"><view><text class="record-level">{{ entry.paper.level === 'CET4' ? '四级' : '六级' }}</text><text class="history-paper-title">{{ paperTitle(entry.paper) }}</text></view><view v-if="entry.latestScore" class="history-score"><text>{{ entry.latestScore.summary.estimatedScore.toFixed(1) }}</text><text class="score-small-label">{{ entry.latestScore.summary.complete ? '练习估分' : '部分估分' }}</text></view></view>
      <view class="history-meta"><text>已答 {{ entry.answered }} / 57</text><text>{{ historyTime(entry.updatedAt) }}</text></view>
      <view class="history-actions"><button v-if="entry.sectionId" class="secondary-button history-continue" @click="continuePaper(entry)">继续做题</button><button class="primary-button history-grade" @click="openScore(entry.paper.id)">查看与评分</button></view>
    </view></view>
  </view></view>
</template>
<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { allProgress, allScores } from '../../utils/storage.js'
import { groupPracticeHistory, historyTime } from '../../utils/history.mjs'
import { paperTitle } from '../../utils/paper.mjs'
import catalog from '../../data/catalog.json'
const entries = ref([]), error = ref('')
function refresh() {
  try { entries.value = groupPracticeHistory(allProgress(), allScores(), catalog); error.value = '' }
  catch (cause) { error.value = cause.message || '历史读取失败' }
}
function openScore(id) { uni.navigateTo({ url: `/pages/score/index?paper=${encodeURIComponent(id)}` }) }
function continuePaper(entry) { uni.navigateTo({ url: `/pages/practice/index?paper=${encodeURIComponent(entry.paper.id)}&section=${entry.sectionId}` }) }
function back() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.reLaunch({ url: '/pages/index/index' }) }
onShow(refresh)
</script>

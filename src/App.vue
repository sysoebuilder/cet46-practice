<template>
  <div :inert="starting ? true : undefined">
  <RouterView v-slot="{ Component, route }">
    <KeepAlive include="HomePage">
      <component :is="Component" :key="route.name === 'practice' ? route.fullPath : 'home'" />
    </KeepAlive>
  </RouterView>
  <AppFeedback />
  </div>
  <StartupScreen @done="starting = false" />
</template>
<script setup>
import AppFeedback from './components/AppFeedback.vue'
import StartupScreen from './components/StartupScreen.vue'
import { ref } from 'vue'
const starting = ref(true)
</script>
<style>
@import './styles/app.css';
</style>

<template>
  <RouterView v-slot="{ Component, route }">
    <KeepAlive include="HomePage">
      <component :is="Component" :key="route.name === 'practice' ? route.fullPath : 'home'" />
    </KeepAlive>
  </RouterView>
  <AppFeedback />
</template>
<script setup>
import AppFeedback from './components/AppFeedback.vue'
</script>
<style>
@import './styles/app.css';
</style>

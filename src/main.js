import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import MotionButton from './components/MotionButton.vue'
import AppIcon from './components/AppIcon.vue'
import ScrollArea from './components/ScrollArea.vue'
import './translation/bootstrap.js'

const app = createApp(App)
app.component('MotionButton', MotionButton)
app.component('AppIcon', AppIcon)
app.component('ScrollArea', ScrollArea)
app.use(router)
router.isReady().then(() => app.mount('#app'))

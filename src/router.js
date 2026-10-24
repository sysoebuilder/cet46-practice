import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from './pages/index/index.vue'
import PracticePage from './pages/practice/index.vue'

let homeScroll = { left: 0, top: 0 }
export const router = createRouter({
  // Hash routing also works offline under file:// without a server.
  history: createWebHashHistory(),
  routes: [
    { path: '/', alias: '/pages/index/index', name: 'home', component: HomePage },
    { path: '/pages/practice/index', name: 'practice', component: PracticePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, saved) {
    return new Promise(resolve => requestAnimationFrame(() => resolve(saved || (to.name === 'home' ? homeScroll : { top: 0 }))))
  },
})
router.beforeEach((_to, from) => {
  if (from.name === 'home') homeScroll = { left: window.scrollX, top: window.scrollY }
})
export function returnHome() {
  if (!['/', '/pages/index/index'].includes(router.options.history.state.back)) return router.replace('/')
  return new Promise(resolve => {
    const remove = router.afterEach(() => { remove(); resolve() })
    router.back()
  })
}

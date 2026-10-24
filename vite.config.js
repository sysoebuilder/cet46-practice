import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { projectRoot } from './scripts/project-paths.mjs'
import { copyResources } from './scripts/copy-resources.mjs'

export default defineConfig(({ mode }) => {
  const native = mode === 'app'
  const outDir = path.join(projectRoot, native ? 'app' : 'dist/build/h5')
  return {
    root: path.join(projectRoot, 'web'), base: './', publicDir: false,
    cacheDir: path.join(projectRoot, 'node_modules/.vite-5plus'),
    optimizeDeps: { entries: [path.join(projectRoot, 'src/main.js')], include: ['vue', 'vue-router', 'motion-v', '@lucide/vue'] },
    plugins: [vue(), {
      name: 'cet-offline-resources',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          return context.server ? html.replace('src="../src/main.js"', `src="/@fs/${projectRoot.replace(/\\/g, '/')}/src/main.js"`) : html
        },
      },
      buildStart() {
        this.addWatchFile(path.join(projectRoot, 'src/static'))
        this.addWatchFile(path.join(projectRoot, 'src/boot'))
        this.addWatchFile(path.join(projectRoot, 'app/manifest.json'))
        this.addWatchFile(path.join(projectRoot, 'scripts/native-bootstrap.js'))
      },
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith('/static/')) request.url = `/@fs/${projectRoot.replace(/\\/g, '/')}/src${request.url}`
          next()
        })
      },
      closeBundle() { copyResources(path.join(projectRoot, 'src/static'), path.join(outDir, 'static')) },
    }, {
      name: 'cet-startup-shell',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const read = file => fs.readFileSync(path.join(projectRoot, 'src/boot', file), 'utf8')
          const name = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/brand.json'), 'utf8')).name
          const safeName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
          const shell = `<style>${read('boot.css')}</style>${read('shell.html').replace('__CET_APP_NAME__', safeName)}<script>${read('fallback.js')}</script>`
          return html.replace('<body>', `<body>${shell}`)
        },
      },
    }],
    server: { host: '0.0.0.0', fs: { allow: [projectRoot] } },
    build: {
      // CSS minification otherwise merges top/right/bottom/left back to inset,
      // which the Android 11 system WebView (Chromium 83) cannot position.
      outDir, emptyOutDir: false, target: 'es2018', cssTarget: 'chrome83',
      ...(native ? { rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } } } : {}),
    },
  }
})

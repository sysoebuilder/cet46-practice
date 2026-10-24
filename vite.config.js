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
    }],
    server: { host: '0.0.0.0', fs: { allow: [projectRoot] } },
    build: {
      outDir, emptyOutDir: false, target: 'es2018',
      ...(native ? { rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } } } : {}),
    },
  }
})

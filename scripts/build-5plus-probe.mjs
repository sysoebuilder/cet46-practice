import path from 'node:path'
import { build } from 'vite'
import { projectRoot } from './project-paths.mjs'
await build({
  configFile: false,
  build: {
    target: 'chrome83', minify: false, emptyOutDir: false,
    outDir: path.join(projectRoot, 'native/foxlet/host-app/build/probe-js'),
    lib: { entry: path.join(projectRoot, 'src/translation/translator.mjs'), name: 'CetTranslator', formats: ['iife'], fileName: () => 'translator.js' },
  },
})

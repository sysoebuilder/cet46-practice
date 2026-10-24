import fs from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import { projectRoot } from './project-paths.mjs'
import { packagePapers } from './package-papers.mjs'
export { projectRoot } from './project-paths.mjs'

const output = path.join(projectRoot, 'app')
const marker = path.join(output, '.generated-cet-5plus')
if (fs.existsSync(output) && !fs.existsSync(marker) && fs.readdirSync(output).some(name => !['manifest.json', '.hbuilderx'].includes(name))) throw new Error(`Refusing to overwrite an unmarked directory: ${output}`)
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(marker, '5+ App. Edit Vue sources and app/manifest.json; npm run build:app.\n')
const manifestPath = path.join(output, 'manifest.json')
if (!fs.existsSync(manifestPath)) {
  const initial = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'))
  initial.launch_path = 'index.html'
  fs.writeFileSync(manifestPath, `${JSON.stringify(initial, null, 2)}\n`)
}

function packageApp() {
  packagePapers(path.join(projectRoot, 'src/static/papers'), path.join(output, 'static/papers'))
  const htmlPath = path.join(output, 'index.html')
  let html = fs.readFileSync(htmlPath, 'utf8')
  if (!html.includes('data-entry=')) {
    const main = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/)
    if (!main) throw new Error('Missing Vue build entry')
    html = html.replace(main[0], '').replace(/\s+crossorigin(?:="[^"]*")?/g, '')
      .replace('</body>', `<script src="./native-bootstrap.js" data-entry="${main[1]}"></script></body>`)
    fs.writeFileSync(htmlPath, html)
  }
  fs.copyFileSync(path.join(projectRoot, 'scripts/native-bootstrap.js'), path.join(output, 'native-bootstrap.js'))
  // The native manifest is source, not generated output: keep all HBuilderX
  // AppID, signing, icons and platform edits intact across rebuilds.
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.launch_path !== 'index.html' || !manifest.plus) throw new Error('app/manifest.json must be a 5+ manifest launching index.html')
  const rootPath = path.join(projectRoot, 'manifest.json')
  // Native asset paths are relative to each manifest's own project root.
  const rootManifest = JSON.parse(JSON.stringify(manifest).replace(/"static\/brand\//g, '"app/static/brand/'))
  const rootConfig = `${JSON.stringify({ ...rootManifest, launch_path: 'app/index.html' }, null, 2)}\n`
  if (fs.readFileSync(rootPath, 'utf8') !== rootConfig) fs.writeFileSync(rootPath, rootConfig)
  console.log('[CET] 5+ App ready: E:/CET46_practice/app (import this folder into HBuilderX)')
}

await build({
  configFile: path.join(projectRoot, 'vite.config.js'), mode: 'app',
  build: { ...(process.argv.includes('--watch') ? { watch: { include: ['src/**', 'web/**', 'scripts/native-bootstrap.js', 'app/manifest.json'].map(file => path.join(projectRoot, file).replace(/\\/g, '/')) } } : {}) },
  plugins: [{ name: 'cet-5plus-entry', closeBundle: { order: 'post', handler: packageApp } }],
})

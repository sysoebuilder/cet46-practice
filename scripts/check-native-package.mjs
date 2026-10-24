import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import sharp from 'sharp'
import { projectRoot } from './project-paths.mjs'

const directory = path.resolve(projectRoot, process.argv[2] || 'app')
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
assert.equal(manifest.launch_path, 'index.html')
assert.ok(manifest.plus && manifest.version && 'id' in manifest)
assert.ok(!manifest['app-plus'] && !manifest['uni-app'])
assert.ok(!fs.existsSync(path.join(directory, 'app-service.js')))
assert.ok(!fs.existsSync(path.join(directory, 'node_modules')))
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
assert.ok(!/type="module"|modulepreload|https?:\/\//.test(html), '5+ entry must be fully local, using classic scripts')
const entry = html.match(/data-entry="([^"]+)"/)?.[1]
assert.ok(entry && fs.existsSync(path.resolve(directory, entry)), 'Missing Vue bundle')
const bundle = fs.readFileSync(path.resolve(directory, entry), 'utf8')
for (const selector of ['overlay', 'segment-indicator', 'year-indicator', 'sheet-backdrop', 'paper-journey']) {
  const style = bundle.match(new RegExp(`\\.${selector}\\{([^}]+)\\}`))?.[1]
  assert.ok(style && !/\binset:/.test(style) && ['top:0', 'right:0', 'bottom:0', 'left:0'].every(offset => style.includes(offset)), `CSS minification broke Android WebView positioning: ${selector}`)
}
const bootstrap = fs.readFileSync(path.join(directory, 'native-bootstrap.js'), 'utf8')
for (const api of ['plusready', 'backbutton', "'pause'", "'resume'"]) assert.ok(bootstrap.includes(api), `Missing 5+ startup capability: ${api}`)
assert.ok(html.includes('closeSplashscreen') && html.includes('cet-boot-cover'), 'Missing branded startup/splash handoff')
function checkBrandPaths(value) {
  if (typeof value === 'string' && value.startsWith('static/brand/')) assert.ok(fs.existsSync(path.join(directory, value)), `Missing native brand asset: ${value}`)
  else if (value && typeof value === 'object') for (const child of Object.values(value)) checkBrandPaths(child)
}
checkBrandPaths(manifest.plus.distribute.icons)
checkBrandPaths(manifest.plus.distribute.splashscreen)
for (const file of Object.values(manifest.plus.distribute.icons.android)) {
  const size = Number(file.match(/icon-(\d+)\.png$/)[1])
  const image = await sharp(path.join(directory, file)).metadata()
  assert.equal(image.width, size); assert.equal(image.height, size)
}
const storeIcon = await sharp(path.join(directory, manifest.plus.distribute.icons.ios.appstore)).metadata()
assert.equal(storeIcon.width, 1024); assert.equal(storeIcon.height, 1024)
assert.equal(storeIcon.hasAlpha, false, 'iOS App Store icon must be opaque')
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/catalog.json'), 'utf8'))
for (const { id } of catalog) {
  const expected = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/static/papers', `${id}.json`), 'utf8'))
  const document = { currentScript: {} }
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'static/papers', `${id}.js`), 'utf8'), { document }, { timeout: 1000 })
  assert.deepEqual(JSON.parse(JSON.stringify(document.currentScript.__cetPaper)), expected, `Paper changed during packaging: ${id}`)
}
const recordings = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/audio.json'), 'utf8'))
for (const recording of Object.values(recordings)) assert.ok(fs.existsSync(path.join(directory, recording.src)), `Missing audio: ${recording.src}`)
const dependencies = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
assert.ok(!Object.keys({ ...dependencies.dependencies, ...dependencies.devDependencies }).some(name => name.startsWith('@dcloudio/')))
console.log(`5+ package passed: classic local entry, ${catalog.length} papers, all audio, native lifecycle; no uni-app service/compiler.`)
if (!manifest.id) console.log('DCloud AppID is empty: generate your own ID in HBuilderX manifest.json before packaging/signing.')

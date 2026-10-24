import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
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
const bootstrap = fs.readFileSync(path.join(directory, 'native-bootstrap.js'), 'utf8')
for (const api of ['plusready', 'backbutton', "'pause'", "'resume'", 'closeSplashscreen']) assert.ok(bootstrap.includes(api), `Missing 5+ startup capability: ${api}`)
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/catalog.json'), 'utf8'))
for (const { id } of catalog) assert.ok(fs.existsSync(path.join(directory, 'static/papers', `${id}.json`)), `Missing paper: ${id}`)
const recordings = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/audio.json'), 'utf8'))
for (const recording of Object.values(recordings)) assert.ok(fs.existsSync(path.join(directory, recording.src)), `Missing audio: ${recording.src}`)
const dependencies = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
assert.ok(!Object.keys({ ...dependencies.dependencies, ...dependencies.devDependencies }).some(name => name.startsWith('@dcloudio/')))
console.log(`5+ package passed: classic local entry, ${catalog.length} papers, all audio, native lifecycle; no uni-app service/compiler.`)
if (!manifest.id) console.log('DCloud AppID is empty: generate your own ID in HBuilderX manifest.json before packaging/signing.')

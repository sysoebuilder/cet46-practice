import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { projectRoot } from './project-paths.mjs'

const source = path.join(projectRoot, '参考/玻璃质感翡翠字母A图标.png')
const directory = path.join(projectRoot, 'src/static/brand')
const sizes = [20, 29, 40, 48, 58, 60, 64, 72, 76, 80, 87, 96, 120, 144, 152, 167, 180, 192, 256, 512, 1024]
await fs.mkdir(directory, { recursive: true })
const input = await fs.readFile(source).catch(error => {
  if (error.code !== 'ENOENT') throw error
  return null
})
if (!input) {
  // Reference artwork is local-only. Fresh clones reuse the exported assets.
  const exports = [...sizes.map(size => `icon-${size}.png`), 'mark.png', 'mark.webp', 'launch-hdpi.png', 'launch-xhdpi.png', 'launch-xxhdpi.png']
  await Promise.all([...exports.map(name => fs.access(path.join(directory, name))), fs.access(path.join(projectRoot, 'src/data/brand.json'))])
  console.log('Brand ready: reusing committed icons and launch images; local reference artwork is absent.')
  process.exit(0)
}
// Ignore isolated transparent-edge speckles when finding the supplied icon's
// main canvas. Crop only the unused margin, keeping a 4px safety perimeter.
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const rows = new Uint32Array(info.height), columns = new Uint32Array(info.width)
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (data[(y * info.width + x) * 4 + 3] > 224) { rows[y]++; columns[x]++ }
}
const xs = [...columns.keys()].filter(x => columns[x] > info.height * 0.15)
const ys = [...rows.keys()].filter(y => rows[y] > info.width * 0.15)
if (!xs.length || !ys.length) throw new Error('The brand icon has no visible artwork')
const side = Math.min(info.width, info.height, Math.max(xs.at(-1) - xs[0] + 1, ys.at(-1) - ys[0] + 1) + 8)
const crop = { left: Math.max(0, Math.min(info.width - side, Math.floor((xs[0] + xs.at(-1) + 1 - side) / 2))), top: Math.max(0, Math.min(info.height - side, Math.floor((ys[0] + ys.at(-1) + 1 - side) / 2))), width: side, height: side }
const artwork = await sharp(input).extract(crop).png().toBuffer()
const background = '#f8faf9'
async function writeChanged(file, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content)
  try { if ((await fs.readFile(file)).equals(buffer)) return } catch (error) { if (error.code !== 'ENOENT') throw error }
  await fs.writeFile(file, buffer)
}
// Deterministic exports of the supplied artwork; the reference is untouched.
for (const size of sizes) {
  await writeChanged(path.join(directory, `icon-${size}.png`), await sharp(artwork).resize(size, size).flatten({ background }).png({ compressionLevel: 9 }).toBuffer())
}
await writeChanged(path.join(directory, 'mark.png'), await sharp(artwork).resize(320, 320).png({ compressionLevel: 9 }).toBuffer())
await writeChanged(path.join(directory, 'mark.webp'), await sharp(artwork).resize(320, 320).webp({ quality: 92, effort: 6 }).toBuffer())

const manifestPath = path.join(projectRoot, 'app/manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const icon = size => `static/brand/icon-${size}.png`
manifest.plus.distribute.icons = {
  android: { mdpi: icon(48), hdpi: icon(72), xhdpi: icon(96), xxhdpi: icon(144), xxxhdpi: icon(192) },
  ios: {
    appstore: icon(1024),
    iphone: { 'app@2x': icon(120), 'app@3x': icon(180), 'spotlight@2x': icon(80), 'spotlight@3x': icon(120), 'settings@2x': icon(58), 'settings@3x': icon(87), 'notification@2x': icon(40), 'notification@3x': icon(60) },
    ipad: { app: icon(76), 'app@2x': icon(152), 'proapp@2x': icon(167), spotlight: icon(40), 'spotlight@2x': icon(80), settings: icon(29), 'settings@2x': icon(58), notification: icon(20), 'notification@2x': icon(40) },
  },
}
const splash = {}
for (const [density, width, height] of [['hdpi', 480, 762], ['xhdpi', 720, 1242], ['xxhdpi', 1080, 1882]]) {
  const size = Math.round(width * 136 / 390)
  const image = await sharp(artwork).resize(size, size).png().toBuffer()
  const name = `launch-${density}.png`
  await writeChanged(path.join(directory, name), await sharp({ create: { width, height, channels: 3, background } }).composite([{ input: image, gravity: 'centre' }]).png().toBuffer())
  splash[density] = `static/brand/${name}`
}
manifest.plus.splashscreen.waiting = false
manifest.plus.distribute.splashscreen = { ...manifest.plus.distribute.splashscreen, androidStyle: 'default', android: splash }
await writeChanged(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
await writeChanged(path.join(projectRoot, 'src/data/brand.json'), `${JSON.stringify({ name: manifest.name, icon: './static/brand/mark.webp', sourceSha256: createHash('sha256').update(input).digest('hex') }, null, 2)}\n`)
console.log(`Brand ready: ${sizes.length} icon sizes, Android launch images, original artwork preserved.`)

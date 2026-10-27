// Inspect the actual installed Android WebView over its ADB-forwarded CDP port.
// No plus/io/storage/audio mocks. APK mode requires a disposable emulator;
// connected-base mode is isolated from production and restores saved CET keys.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { projectRoot } from './project-paths.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const connectedBase = args.includes('--connected-base')
const endpoint = option('--endpoint', 'http://127.0.0.1:9228')
const output = option('--output', 'E:/四六级真题/work/android')
const adb = option('--adb', path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe'))
const serial = option('--serial', 'emulator-5580')
if (!connectedBase) assert.match(serial, /^emulator-\d+$/, 'APK regression is restricted to an emulator test installation')
const execute = promisify(execFile)
const input = (...args) => execute(adb, ['-s', serial, 'shell', 'input', ...args])
const androidPackage = option('--package', 'com.hexun.cet46practice')
if (connectedBase) assert.equal(androidPackage, 'io.dcloud.HBuilder', 'Connected-phone tests may only use the separate standard base')
const { stdout: pid } = await execute(adb, ['-s', serial, 'shell', 'pidof', androidPackage])
assert.match(pid.trim(), /^\d+$/)
if (!connectedBase) {
  const { stdout: avdName } = await execute(adb, ['-s', serial, 'emu', 'avd', 'name'])
  assert.ok(avdName.includes('cet46_apk_validation') || avdName.includes('cet46_translation_validation'), 'Use the disposable CET validation AVD, not an existing personal emulator')
}
await execute(adb, ['-s', serial, 'forward', `tcp:${new URL(endpoint).port}`, `localabstract:webview_devtools_remote_${pid.trim()}`])
const targets = await (await fetch(`${endpoint}/json`)).json()
const target = targets.find(target => target.url?.includes(connectedBase ? '/apps/HBuilder/www/index.html' : '/apps/H59A7E9D7/www/index.html'))
assert.ok(target, 'No installed CET App WebView found on this debugging port')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let nextId = 0
const pending = new Map(), errors = [], checks = []
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
  if (!message.id) return
  const waiter = pending.get(message.id)
  if (!waiter) return
  clearTimeout(waiter.timer)
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
  else waiter.resolve(message.result)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression) {
  const started = Date.now()
  while (Date.now() - started < 15000) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Android UI did not settle: ${expression}\n${await evaluate('document.body.innerText.slice(-1500)')}`)
}
async function tap(selector, index = 0) {
  await until(`Boolean(document.querySelectorAll(${JSON.stringify(selector)})[${index}])`)
  const point = await evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`)
  await delay(80)
  // Read again once the sheet spring and native scroll have stopped moving.
  let previous = point
  for (let count = 0; count < 15; count++) {
    await delay(70)
    const current = await evaluate(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y) < 0.5) { Object.assign(point, current); break }
    previous = current
    Object.assign(point, current)
  }
  // CDP touch injection is ignored by some embedded WebViews. Inject through
  // Android's input service, accounting for the native status-bar offset.
  const view = JSON.parse(target.description)
  const width = await evaluate('visualViewport.width')
  const scale = view.width / width
  await input('tap', String(Math.round(view.screenX + point.x * scale)), String(Math.round(view.screenY + point.y * scale)))
}
async function screenshot(name) {
  const image = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64'))
}
function pass(message) { checks.push(message); console.log(`PASS ${message}`) }
async function openSection(section) {
  await evaluate(`location.hash = ${JSON.stringify(`/pages/practice/index?paper=CET4-2025-12-1&section=${section}`)}`)
  await until(`Boolean(document.querySelector('.practice')) && !document.querySelector('.loading-state') && Boolean(document.querySelector('.check-answers-button, .redo-button')) && !document.querySelector('.paper-journey')`)
}
const saved = section => evaluate(`JSON.parse(plus.storage.getItem('cet:progress:v1:CET4-2025-12-1:${section}')).data`)
let environment, baseBackup
await fs.mkdir(output, { recursive: true })
try {
  await send('Runtime.enable')
  await send('Page.enable')
  await until(`window.__CET_STARTUP_DONE__ && window.__CET_LOCAL_APP__ === true && Boolean(window.plus)`)
  environment = await evaluate(`({ url: location.href, resourceRoot: window.__CET_RESOURCE_ROOT__, entry: document.querySelector('[data-entry]').getAttribute('data-entry'), os: plus.os.name, osVersion: plus.os.version, ua: navigator.userAgent })`)
  const expectedEntry = (await fs.readFile(path.join(projectRoot, 'app/index.html'), 'utf8')).match(/data-entry="([^"]+)"/)[1]
  assert.equal(environment.entry, expectedEntry, 'Installed APK contains a stale Vue bundle')
  if (connectedBase) assert.ok(environment.url.includes('/io.dcloud.HBuilder/'), 'Expected the separate HBuilder standard base')
  else assert.ok(environment.url.startsWith('file:///android_asset/'), 'Expected actual installed APK assets, not extracted desktop files')
  assert.equal(environment.os, 'Android')
  pass(connectedBase ? 'Physical Android phone standard-base startup and real plus bridge' : 'Installed APK startup and real Android plus bridge')
  if (connectedBase) {
    const backupPath = path.join(output, 'vivo-base-storage-before-test.json')
    if (args.includes('--recover-base-backup')) {
      baseBackup = JSON.parse(await fs.readFile(backupPath, 'utf8'))
    } else {
      baseBackup = await evaluate(`(() => { const data = {}; for (let i = 0; i < plus.storage.getLength(); i++) { const key = plus.storage.key(i); if (key && key.startsWith('cet:')) data[key] = plus.storage.getItem(key) } return data })()`)
      await fs.writeFile(backupPath, JSON.stringify(baseBackup, null, 2))
    }
  }

  if (args.includes('--cold-resume')) {
    await until(`Boolean(document.querySelector('.resume-card'))`)
    await tap('.resume-card')
    await until(`document.querySelectorAll('.cloze-blank.filled').length === 1`)
    assert.equal((await saved('cloze')).answers['26'], 'A')
    await screenshot('apk-cold-resume.png')
    pass('Cold process restart restores the saved cloze answer through the home resume entry')
  } else {
    // Only the disposable validation AVD's six sample records are reset.
    // The cold-resume phase below deliberately preserves them.
    await evaluate(`location.hash = '/'`)
    await until(`Boolean(document.querySelector('.home .paper-row'))`)
    await evaluate(`['cloze', 'matching', 'reading', 'writing', 'translation', 'listening'].forEach(section => plus.storage.removeItem('cet:progress:v1:CET4-2025-12-1:' + section))`)
    // Use native WebView resource loading for every paper, comparing all fields.
    const catalog = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/data/catalog.json'), 'utf8'))
    for (const { id } of catalog) {
      const actual = await evaluate(`new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('static/papers/${id}.js', window.__CET_RESOURCE_ROOT__).href;
        const timer = setTimeout(() => { script.remove(); reject(new Error('Paper script timeout')) }, 10000);
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Paper script failed: ${id}')) };
        script.onload = () => { clearTimeout(timer); const data = script.__cetPaper; script.remove(); resolve(data) };
        document.head.appendChild(script);
      })`)
      assert.deepEqual(actual, JSON.parse(await fs.readFile(path.join(projectRoot, 'src/static/papers', `${id}.json`), 'utf8')), id)
    }
    pass(connectedBase ? 'All 119 papers load from standard-base bundled resources and exactly match source JSON' : 'All 119 papers load from APK assets and exactly match source JSON')

    const recordings = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/data/audio.json'), 'utf8'))
    const audioResults = []
    for (const recording of new Map(Object.values(recordings).map(recording => [recording.src, recording])).values()) {
      const duration = await evaluate(`new Promise((resolve, reject) => {
        const audio = new Audio(); audio.preload = 'metadata';
        const clean = () => { clearTimeout(timer); audio.onloadedmetadata = audio.onerror = null; audio.removeAttribute('src'); audio.load() };
        const timer = setTimeout(() => { clean(); reject(new Error('Audio metadata timeout')) }, 10000);
        audio.onloadedmetadata = () => { const duration = audio.duration; clean(); resolve(duration) };
        audio.onerror = () => { clean(); reject(new Error('Bundled audio cannot load')) };
        audio.src = new URL(${JSON.stringify(recording.src.replace(/^\//, ''))}, window.__CET_RESOURCE_ROOT__).href;
      })`)
      assert.ok(duration > 0 && Number.isFinite(duration), recording.src)
      audioResults.push({ source: recording.src, duration })
    }
    await fs.writeFile(path.join(output, 'apk-audio-metadata.json'), JSON.stringify(audioResults, null, 2))
    pass(`All ${audioResults.length} bundled audio recordings have readable durations in the installed Android WebView`)

    await tap('.paper-row')
    await until(`document.querySelectorAll('.section-row').length === 6`)
    pass('Home paper selection opens all six section entries')
    await tap('.section-sheet .close-button')
    await until(`!document.querySelector('.motion-overlay')`)

    // A regression must not silently fall back to the old incompatible path.
    await evaluate(`window.fetch = () => { throw new Error('No fetch in APK paper regression') }; plus.io.resolveLocalFileSystemURL = () => { throw new Error('No FileReader path in APK paper regression') }`)
    await openSection('cloze')
    if (await evaluate(`Boolean(document.querySelector('.redo-button'))`)) await tap('.redo-button')
    await until(`document.querySelectorAll('.cloze-blank').length === 10`)
    await tap('.cloze-blank')
    await until(`document.querySelectorAll('.word-picker .option').length === 15`)
    await tap('.word-picker .option-label')
    await until(`document.querySelectorAll('.cloze-blank.filled').length === 1 && !document.querySelector('.motion-overlay')`)
    assert.equal((await saved('cloze')).answers['26'], 'A')
    await tap('.check-answers-button')
    await until(`Boolean(document.querySelector('.results-sheet .result-list-entry'))`)
    await screenshot('apk-checked-sheet.png')
    await tap('.results-sheet .close-button')
    await until(`!document.querySelector('.motion-overlay')`)
    await screenshot('apk-cloze-filled.png')
    pass('Real touch word selection, native progress save, answer checking and sheet close without fetch/FileReader')

    for (const section of ['matching', 'reading']) {
      await openSection(section)
      await tap('.floating-answer-button')
      await until(`Boolean(document.querySelector('.reading-picker .question-summary'))`)
      await tap('.question-number')
      await until(`Boolean(document.querySelector('.question-entry .option'))`)
      await tap('.question-entry .option-label')
      await until(`Boolean(document.querySelector('.chosen-answer'))`)
      assert.ok(Object.keys((await saved(section)).answers).length > 0)
      await tap('.reading-picker .close-button')
      await until(`!document.querySelector('.motion-overlay')`)
      pass(`${section} loads the passage and saves a real touch answer`)
    }
    for (const section of ['writing', 'translation']) {
      await openSection(section)
      await tap('textarea')
      const draft = `CET${section}validation`
      // Allow the physical phone's IME/viewport resize to finish before input.
      await delay(600)
      if (connectedBase) await send('Input.insertText', { text: draft })
      else await input('text', draft)
      await until(`document.querySelector('textarea').value.includes(${JSON.stringify(draft)})`)
      assert.ok(Object.values((await saved(section)).answers).some(answer => answer.includes(draft)))
      await send('Runtime.evaluate', { expression: `document.activeElement.blur()` })
      pass(`${section} input reaches the native persisted progress record`)
    }
    await openSection('listening')
    await until(`Boolean(document.querySelector('.listening-question'))`)
    await tap('.audio-play-button')
    await until(`document.querySelector('.audio-play-button').innerText.includes('暂停')`)
    await until(`!/^00:00\\s+00:00$/.test(document.querySelector('.audio-times').innerText)`)
    await tap('.next-button')
    await until(`document.querySelector('.position').innerText.includes('2 /')`)
    if (connectedBase) {
      // Relaunching PandoraEntry starts the base launcher, not the selected
      // project. Validate background/cold start separately in the real APK.
      await tap('.audio-play-button')
      await until(`document.querySelector('.audio-play-button').innerText.includes('播放')`)
    } else {
      await input('keyevent', '3')
      await until(`document.querySelector('.audio-play-button').innerText.includes('播放')`)
      await execute(adb, ['-s', serial, 'shell', 'am', 'start', '-n', `${androidPackage}/io.dcloud.PandoraEntry`])
      await delay(300)
    }
    await screenshot('apk-listening.png')
    pass(connectedBase ? 'Physical-phone audio plays, pauses and persists across group changes' : 'Bundled audio plays, persists across group changes and pauses on the real Android HOME/background event')

    await tap('.font-button')
    await until(`document.querySelectorAll('.font-choice').length === 3`)
    await tap('.font-choice', 2)
    await tap('.utility-sheet .close-button')
    await until(`!document.querySelector('.motion-overlay')`)
    await tap('.answer-card-button')
    await until(`document.querySelectorAll('.answer-number').length === 25`)
    const overflow = await evaluate(`Array.from(document.querySelectorAll('.answer-number')).filter(tile => {
      const box = tile.getBoundingClientRect();
      return Array.from(tile.children).some(child => { const rect = child.getBoundingClientRect(); return rect.left < box.left || rect.right > box.right + 1 || rect.top < box.top || rect.bottom > box.bottom + 1 });
    }).length`)
    assert.equal(overflow, 0, 'Answer card contents exceed their tile bounds')
    await screenshot('apk-answer-card-large-font.png')
    await input('keyevent', '4')
    await until(`!document.querySelector('.motion-overlay')`)
    pass('25-question answer card stays inside its tiles at large font and closes with the Android BACK key')

    await openSection('cloze')
    await send('Page.reload', {})
    await until(`window.__CET_STARTUP_DONE__ && document.querySelectorAll('.cloze-blank.filled').length === 1`)
    assert.equal((await saved('cloze')).answers['26'], 'A')
    pass('Full WebView reload restores the native saved answer')
  }
  assert.deepEqual(errors, [], 'Uncaught Android WebView exceptions')
  await fs.writeFile(path.join(output, connectedBase ? 'physical-phone-base-report.json' : args.includes('--cold-resume') ? 'cold-resume-report.json' : 'installed-apk-report.json'), JSON.stringify({ status: 'passed', environment, checks, errors, date: new Date().toISOString() }, null, 2))
} catch (error) {
  await screenshot('apk-regression-failure.png').catch(() => {})
  await fs.writeFile(path.join(output, 'installed-apk-failure.json'), JSON.stringify({ status: 'failed', environment, checks, errors, error: String(error), date: new Date().toISOString() }, null, 2))
  throw error
} finally {
  if (baseBackup) {
    // Finish the practice component's last save before restoring the snapshot.
    await evaluate(`location.hash = '/'`)
    await until(`Boolean(document.querySelector('.home .paper-row'))`)
    await evaluate(`(() => {
      const backup = ${JSON.stringify(baseBackup)}; const keys = [];
      for (let i = 0; i < plus.storage.getLength(); i++) { const key = plus.storage.key(i); if (key && key.startsWith('cet:')) keys.push(key) }
      keys.forEach(key => plus.storage.removeItem(key));
      Object.entries(backup).forEach(([key, value]) => plus.storage.setItem(key, value));
    })()`)
    const restored = await evaluate(`(() => { const data = {}; for (let i = 0; i < plus.storage.getLength(); i++) { const key = plus.storage.key(i); if (key && key.startsWith('cet:')) data[key] = plus.storage.getItem(key) } return data })()`)
    assert.deepEqual(restored, baseBackup, 'Standard-base test storage was not restored')
    console.log('PASS Original standard-base CET storage restored; production App untouched')
  }
  ws.close()
}

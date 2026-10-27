// Real Android WebView + Native.js only. No transport or translation fixtures.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const serial = option('--serial', 'emulator-5580')
const adb = option('--adb', path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe'))
const output = option('--output', 'E:/四六级真题/work/foxlet/sdk-research')
const full = args.includes('--full')
const androidPackage = 'com.hexun.cet46practice.foxlettest'
const execute = promisify(execFile)
const command = (...parameters) => execute(adb, ['-s', serial, ...parameters])
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await fs.mkdir(output, { recursive: true })
let pid = ''
for (let attempt = 0; attempt < 60 && !pid; attempt++) {
  try { pid = (await command('shell', 'pidof', androidPackage)).stdout.trim() } catch {}
  if (!pid) await delay(200)
}
assert.match(pid, /^\d+$/)
await command('forward', 'tcp:9337', `localabstract:webview_devtools_remote_${pid}`)
let target
for (let attempt = 0; attempt < 90 && !target; attempt++) {
  try { target = (await (await fetch('http://127.0.0.1:9337/json')).json()).find(t => t.url?.includes('/apps/H59A7E9D7/www/index.html')) } catch {}
  if (!target) await delay(500)
}
assert.ok(target, '5+ app has no inspectable ordinary HTML page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let sequence = 0
const pending = new Map(), errors = []
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
  const task = pending.get(message.id)
  if (!task) return
  clearTimeout(task.timer); pending.delete(message.id)
  if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 60000)
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function until(expression) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(expression)) return; await delay(200) }
  throw new Error(`WebView did not settle: ${expression}`)
}
async function touchPoint(point, hold = false) {
  // The SDK splash screen can move the WebView after the initial CDP inventory.
  const current = (await (await fetch('http://127.0.0.1:9337/json')).json()).find(item => item.id === target.id)
  const view = JSON.parse(current.description), width = await evaluate('visualViewport.width')
  const x = String(Math.round(view.screenX + point.x * view.width / width))
  const y = String(Math.round(view.screenY + point.y * view.width / width))
  if (hold) await command('shell', 'input', 'swipe', x, y, x, y, '850')
  else await command('shell', 'input', 'tap', x, y)
}
async function touch(selector) {
  await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await touchPoint(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`))
}
async function englishPoint(selector) {
  await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest'})`)
  await delay(350)
  return evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node,word;while(node=walker.nextNode()){word=/[A-Za-z]{3,}/.exec(node.textContent);if(word)break}if(!word)throw Error('Expected English copy');const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);const r=range.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
}
async function wordAndSelection(selector) {
  const point = await englishPoint(selector)
  await touchPoint(point)
  await until(`Boolean(document.querySelector('.translation-card.is-open:not(.is-selection)'))`)
  if (report.inferencePassed) await until(`/[\\u4e00-\\u9fff]/.test(document.querySelector('.translation-result').textContent) && !document.querySelector('.translation-result.is-loading,.translation-result.is-error')`)
  await command('shell', 'input', 'keyevent', '4')
  await until(`!document.querySelector('.translation-card.is-open')`)
  await touchPoint(point, true)
  await until(`getSelection().toString().trim().length > 0 && Boolean(document.querySelector('.translation-card.is-selection.is-open'))`)
  await delay(300)
  await touch('.translation-card [data-action="translate"]')
  if (report.inferencePassed) await until(`/[\\u4e00-\\u9fff]/.test(document.querySelector('.translation-result').textContent) && !document.querySelector('.translation-result.is-loading,.translation-result.is-error')`)
  await touch('.translation-card [data-action="reselect"]')
  await until(`!document.querySelector('.translation-card.is-open')`)
}
const report = { package: androidPackage, serial, kind: full ? 'full-reading-ui' : 'nativejs-probe', source: 'actual Android WebView and Native.js' }
try {
  await send('Runtime.enable')
  await until('Boolean(window.plus && plus.android)')
  report.environment = await evaluate('({appid:plus.runtime.appid,version:plus.os.version,ua:navigator.userAgent,url:location.href})')
  if (!full) {
    await until('Boolean(window.__CET_PROBE__ && window.__CET_PROBE__.asyncCallback)')
    const probe = await evaluate('window.__CET_PROBE__')
    assert.equal(probe.echo, true); assert.equal(probe.foxletClass, true)
    assert.deepEqual(probe.thread, { workerMain: false, callbackMain: true })
    report.probe = probe
  } else {
    await until('Boolean(window.__CET_STARTUP_DONE__ && window.translator)')
  }
  const engine = full ? 'window.translator' : 'window.CetTranslator.translator'
  const { stdout: abi } = await command('shell', 'getprop', 'ro.product.cpu.abilist')
  report.abi = abi.trim()
  const outcome = await evaluate(`(async()=>{try{return {text:await ${engine}.translate('Hello world.')}}catch(e){return {code:e.code,message:e.message}}})()`)
  if (abi.trim().split(',')[0] === 'arm64-v8a') {
    assert.match(outcome.text || '', /[\u4e00-\u9fff]/)
    report.inferencePassed = true
    const repeated = await evaluate(`(async()=>{await ${engine}.init();await ${engine}.init();return {text:await ${engine}.translate('Hello world.'),status:${engine}.getStatus()}})()`)
    assert.equal(repeated.text, outcome.text)
    assert.equal(repeated.status.native.initializations, 1)
    assert.ok(repeated.status.cached >= 1)
    report.repeatedInitialization = false; report.cachedTranslationPassed = true
  } else {
    assert.equal(outcome.code, 'UNSUPPORTED_DEVICE', 'Must reach the actual native callback, not NATIVE_UNAVAILABLE')
    report.inferencePassed = false; report.nativeErrorCallbackPassed = true
  }
  report.status = await evaluate(`${engine}.getStatus()`)
  report.clipboardPassed = await evaluate(`(()=>{const a=plus.android;const service=a.invoke(a.runtimeMainActivity(),'getSystemService','clipboard');const old=a.invoke(service,'getPrimaryClip');try{const data=a.invoke('android.content.ClipData','newPlainText','CET probe','CET clipboard probe');a.invoke(service,'setPrimaryClip',data);const current=a.invoke(service,'getPrimaryClip');return String(a.invoke(a.invoke(current,'getItemAt',0),'getText'))==='CET clipboard probe'}finally{if(old)a.invoke(service,'setPrimaryClip',old);else a.invoke(service,'clearPrimaryClip')}})()`)
  assert.equal(report.clipboardPassed, true)
  if (full) {
    await evaluate(`location.hash='/'`)
    await until(`Boolean(document.querySelector('.home .paper-row'))`)
    await evaluate(`location.hash='/pages/practice/index?paper=CET4-2025-12-1&section=reading'`)
    await until(`Boolean(document.querySelector('.material-scroll .reading-text'))`)
    // Wait for the existing route spring and article layout before native input.
    await delay(1200)
    const point = await evaluate(`(()=>{const el=document.querySelector('.material-scroll .reading-text');const node=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode();const m=/[A-Za-z]{3,}/.exec(node.textContent);const r=document.createRange();r.setStart(node,m.index);r.setEnd(node,m.index+m[0].length);const b=r.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`)
    await touchPoint(point)
    await until(`Boolean(document.querySelector('.translation-card.is-open'))`)
    if (!report.inferencePassed) await until(`document.querySelector('.translation-result.is-error') && window.translator.getStatus().error==='UNSUPPORTED_DEVICE'`)
    report.wordTapPassed = true
    if (report.inferencePassed) await until(`/[\\u4e00-\\u9fff]/.test(document.querySelector('.translation-result').textContent) && !document.querySelector('.translation-result.is-loading,.translation-result.is-error')`)
    await command('shell', 'input', 'keyevent', '4')
    await until(`!document.querySelector('.translation-card.is-open')`)
    assert.equal(await evaluate(`Boolean(document.querySelector('.practice'))`), true)
    report.backClosesTranslation = true
    await touchPoint(point, true)
    await until(`Boolean(getSelection().toString().trim())`)
    await until(`Boolean(document.querySelector('.translation-card.is-selection.is-open'))`)
    await delay(500)
    const originalLength = await evaluate('getSelection().toString().length')
    await touch('.translation-card [data-action="sentence"]')
    await until(`getSelection().toString().length > ${originalLength}`)
    report.sentenceSelectionLength = await evaluate('getSelection().toString().length')
    report.nativeLongPressPassed = true
    await touch('.translation-card [data-action="translate"]')
    if (!report.inferencePassed) await until(`Boolean(document.querySelector('.translation-result.is-error'))`)
    report.selectedTextBridgePassed = true
    await touch('.translation-card [data-action="reselect"]')
    // Long real article text, not a fabricated translation. The Android
    // swipe proves nested card scrolling; long result layout is browser-tested.
    await evaluate(`(()=>{const node=document.createTreeWalker(document.querySelector('.material-scroll .reading-text'),NodeFilter.SHOW_TEXT).nextNode();const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(420,node.length));getSelection().removeAllRanges();getSelection().addRange(range)})()`)
    await until(`Boolean(document.querySelector('.translation-card.is-selection.is-open')) && document.querySelector('.translation-source').scrollHeight > document.querySelector('.translation-source').clientHeight`)
    await delay(400)
    const cardScrollPoint = await evaluate(`(()=>{const source=document.querySelector('.translation-source').getBoundingClientRect(),body=document.querySelector('.translation-content').getBoundingClientRect();const top=Math.max(source.top,body.top),bottom=Math.min(source.bottom,body.bottom);return {x:source.x+source.width/2,y1:top+(bottom-top)*.85,y2:top+(bottom-top)*.2}})()`)
    const cardTarget = (await (await fetch('http://127.0.0.1:9337/json')).json()).find(item => item.id === target.id)
    const cardView = JSON.parse(cardTarget.description), cardScale = cardView.width / await evaluate('visualViewport.width')
    const scrollX = String(Math.round(cardView.screenX + cardScrollPoint.x * cardScale))
    await command('shell', 'input', 'swipe', scrollX, String(Math.round(cardView.screenY + cardScrollPoint.y1 * cardScale)), scrollX, String(Math.round(cardView.screenY + cardScrollPoint.y2 * cardScale)), '550')
    await until(`document.querySelector('.translation-source').scrollTop > 0 && Boolean(document.querySelector('.translation-card.is-open'))`)
    report.longSourceNativeScrollPassed = true
    const scrollImage = await send('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(path.join(output, 'long-source-native.png'), Buffer.from(scrollImage.data, 'base64'))
    await touch('.translation-card [data-action="reselect"]')
    await touch('.floating-answer-button')
    await until(`Boolean(document.querySelector('.reading-picker .question-stem'))`)
    const answeredBefore = await evaluate(`document.querySelector('.answered-count').textContent`)
    await wordAndSelection('.question-entry .question-stem')
    assert.equal(await evaluate(`Boolean(document.querySelector('.question-entry.expanded'))`), false)
    report.questionTextNativeSelectionPassed = true
    await touch('.question-number')
    await until(`Boolean(document.querySelector('.question-entry .option-text'))`)
    await wordAndSelection('.question-entry .option-text')
    assert.equal(await evaluate(`document.querySelector('.answered-count').textContent`), answeredBefore)
    report.optionTranslationDoesNotChoose = true
    await touch('.question-entry .option-label')
    await until(`Boolean(document.querySelector('.question-entry .chosen-answer'))`)
    report.letterChoosesAnswer = true
    await touch('.reading-picker .close-button')
    for (const section of ['listening', 'cloze', 'writing', 'translation']) {
      await evaluate(`location.hash=${JSON.stringify('/pages/practice/index?paper=CET4-2025-12-1&section=')}+${JSON.stringify(section)}`)
      await until(`Boolean(document.querySelector('.check-answers-button,.redo-button')) && !document.querySelector('.loading-state,.motion-overlay')`)
      await delay(800)
      if (section === 'listening') {
        await wordAndSelection('.listening-question .option-text')
        report.listeningOptionNativeSelectionPassed = true
      } else if (section === 'cloze') {
        await touch('.cloze-blank .blank-label')
        await until(`Boolean(document.querySelector('.word-picker .option-text'))`)
        await wordAndSelection('.word-picker .option-text')
        await touch('.word-picker .option-label')
        await until(`!document.querySelector('.word-picker') && Boolean(document.querySelector('.blank-translation'))`)
        await wordAndSelection('.blank-translation')
        report.wordBankAndFilledBlankNativeSelectionPassed = true
      } else {
        await touch('.directions-toggle')
        await until(`Boolean(document.querySelector('.directions'))`)
        await wordAndSelection('.directions')
        report[section + 'DirectionsNativeSelectionPassed'] = true
      }
    }
  }
  assert.deepEqual(errors, [])
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(output, full ? 'full-reading-native.png' : 'probe-native.png'), Buffer.from(screenshot.data, 'base64'))
  report.statusOfChecks = 'passed'
  await fs.writeFile(path.join(output, full ? 'full-native-report.json' : 'probe-native-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.statusOfChecks = 'failed'; report.error = String(error); report.errors = errors
  await fs.writeFile(path.join(output, full ? 'full-native-failure.json' : 'probe-native-failure.json'), JSON.stringify(report, null, 2))
  throw error
} finally { ws.close() }

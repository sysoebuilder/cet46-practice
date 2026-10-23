import test from 'node:test'
import assert from 'node:assert/strict'
import { createListeningPlayer, formatAudioTime } from '../src/utils/listening-player.mjs'

function fixture(saved) {
  const events = {}, calls = [], records = new Map()
  const source = { src: '/static/audio/test.mp3', sha256: 'recording-id' }
  const key = 'cet:audio:v1:CET4-2024-12-1'
  if (saved) records.set(key, saved)
  records.set('cet:progress:v1:CET4-2024-12-1:listening', { answers: { 1: 'B' } })
  const context = { duration: 120, currentTime: 0, autoplay: true,
    play() { calls.push('play'); events.Play?.() },
    pause() { calls.push('pause'); events.Pause?.() },
    seek(value) { calls.push(['seek', value]); this.currentTime = value },
    destroy() { calls.push('destroy') },
  }
  for (const name of ['Canplay', 'Play', 'Pause', 'TimeUpdate', 'Ended', 'Error']) context[`on${name}`] = callback => { events[name] = callback }
  let state
  const player = createListeningPlayer({ source, paperId: 'CET4-2024-12-1', api: {
    createInnerAudioContext: () => context,
    getStorageSync: key => records.get(key),
    setStorageSync: (key, value) => records.set(key, value),
  }, onChange: value => { state = value } })
  return { player, context, calls, records, events, key, get state() { return state } }
}
test('audio waits for a user action, seeks within its duration and saves separately from answers', () => {
  const f = fixture()
  assert.equal(f.context.autoplay, false)
  assert.equal(f.calls.includes('play'), false)
  f.events.Canplay()
  f.player.play()
  assert.equal(f.state.playing, true)
  f.player.seek(38)
  assert.equal(f.context.currentTime, 38)
  f.player.pause()
  assert.equal(f.state.playing, false)
  assert.equal(f.records.get(f.key).position, 38)
  assert.deepEqual(f.records.get('cet:progress:v1:CET4-2024-12-1:listening'), { answers: { 1: 'B' } })
  f.player.seek(1000)
  assert.equal(f.context.currentTime, 120)
})
test('resume uses the recording fingerprint; a different recording starts at zero', () => {
  const resumed = fixture({ sha256: 'recording-id', position: 35 })
  resumed.events.Canplay()
  assert.equal(resumed.context.currentTime, 35)
  const replaced = fixture({ sha256: 'old-recording', position: 35 })
  replaced.events.Canplay()
  assert.equal(replaced.context.currentTime, 0)
})
test('unloading releases audio, ignores late events and end-of-track restarts from zero', () => {
  const f = fixture()
  f.events.Canplay(); f.player.play(); f.context.currentTime = 20; f.events.TimeUpdate()
  assert.equal(f.records.get(f.key).position, 20)
  f.events.Ended()
  assert.equal(f.records.get(f.key).position, 0)
  f.player.destroy()
  const before = f.state
  f.events.Play(); f.events.Error()
  assert.equal(f.state, before)
  assert.ok(f.calls.includes('destroy'))
})
test('playback errors are surfaced and timestamp formatting is stable', () => {
  const f = fixture()
  f.events.Error()
  assert.equal(f.state.error, true)
  assert.equal(f.state.playing, false)
  assert.equal(formatAudioTime(73.9), '01:13')
  assert.equal(formatAudioTime(Infinity), '00:00')
})

// Thin HTMLAudioElement adapter keeps the tested player/state machine intact.
export function createAudioContext() {
  const element = new Audio()
  element.preload = 'metadata'
  const listeners = []
  const on = (name, callback) => { element.addEventListener(name, callback); listeners.push([name, callback]) }
  return {
    get src() { return element.src }, set src(value) { element.src = value },
    get autoplay() { return element.autoplay }, set autoplay(value) { element.autoplay = value },
    get currentTime() { return element.currentTime },
    get duration() { return element.duration },
    play() { element.play()?.catch(() => element.dispatchEvent(new Event('error'))) },
    pause() { element.pause() },
    seek(value) { element.currentTime = value },
    onCanplay(callback) { on('loadedmetadata', callback); on('canplay', callback) },
    onPlay(callback) { on('play', callback) },
    onPause(callback) { on('pause', callback) },
    onTimeUpdate(callback) { on('timeupdate', callback) },
    onEnded(callback) { on('ended', callback) },
    onError(callback) { on('error', callback) },
    destroy() {
      for (const [name, callback] of listeners) element.removeEventListener(name, callback)
      element.pause(); element.removeAttribute('src'); element.load()
    },
  }
}

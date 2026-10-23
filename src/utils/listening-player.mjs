export function formatAudioTime(value) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function createListeningPlayer({ source, paperId, api = uni, onChange = () => {} }) {
  const key = `cet:audio:v1:${paperId}`
  const state = { position: 0, duration: 0, playing: false, loading: false, error: false, saveFailed: false }
  let disposed = false, pendingStart = null, lastSaved = 0, readFailed = false
  const emit = () => { if (!disposed) onChange({ ...state }) }
  const validTime = value => Number.isFinite(value) && value >= 0
  try {
    const saved = api.getStorageSync(key)
    if (saved?.sha256 === source.sha256 && validTime(saved.position)) state.position = saved.position
  } catch { readFailed = true; state.saveFailed = true }
  pendingStart = state.position
  const audio = api.createInnerAudioContext()
  audio.autoplay = false
  const save = () => {
    if (disposed || readFailed) return
    try {
      api.setStorageSync(key, { sha256: source.sha256, position: state.position, updatedAt: Date.now() })
      lastSaved = state.position
      state.saveFailed = false
    } catch { state.saveFailed = true }
  }
  const refresh = () => {
    if (validTime(audio.duration) && audio.duration > 0) state.duration = audio.duration
    if (pendingStart !== null && state.duration > 0) {
      const position = Math.min(pendingStart, Math.max(0, state.duration - 0.1))
      pendingStart = null
      state.position = position
      if (position > 0) { audio.seek(position); return }
    }
    if (pendingStart === null && validTime(audio.currentTime)) state.position = audio.currentTime
  }
  audio.onCanplay(() => { if (disposed) return; refresh(); emit() })
  audio.onPlay(() => { if (disposed) return; state.playing = true; state.loading = false; state.error = false; emit() })
  audio.onPause(() => { if (disposed) return; refresh(); state.playing = false; state.loading = false; save(); emit() })
  audio.onTimeUpdate(() => {
    if (disposed) return
    refresh()
    if (state.playing && Math.abs(state.position - lastSaved) >= 5) save()
    emit()
  })
  audio.onEnded(() => {
    if (disposed) return
    state.position = 0; state.playing = false; state.loading = false
    pendingStart = 0
    save(); emit()
  })
  audio.onError(() => { if (disposed) return; state.error = true; state.playing = false; state.loading = false; emit() })
  audio.src = source.src
  emit()
  return {
    play() {
      if (disposed) return
      state.loading = true; state.error = false; emit()
      try { audio.play() } catch { state.error = true; state.loading = false; emit() }
    },
    pause() {
      if (disposed) return
      audio.pause(); refresh(); state.playing = false; state.loading = false; save(); emit()
    },
    seek(position) {
      if (disposed || !validTime(position) || state.duration <= 0) return
      pendingStart = null
      state.position = Math.max(0, Math.min(position, state.duration))
      audio.seek(state.position); save(); emit()
    },
    destroy() {
      if (disposed) return
      audio.pause(); refresh(); save()
      disposed = true
      audio.destroy()
    },
  }
}

const pending = new Map()

export function readBundledPaper(id) {
  if (!/^CET[46]-\d{4}-\d{2}-[123]$/.test(id)) return Promise.reject(new Error('无效的试卷'))
  if (pending.has(id)) return pending.get(id)
  const request = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const root = globalThis.__CET_RESOURCE_ROOT__ || new URL('./', location.href).href
    script.src = new URL(`static/papers/${id}.js`, root).href
    script.async = true
    let timer
    const finish = (error, paper) => {
      clearTimeout(timer)
      script.onload = script.onerror = null
      delete script.__cetPaper
      script.remove()
      if (error) reject(error)
      else resolve(paper)
    }
    script.onload = () => {
      const paper = script.__cetPaper
      const actualId = paper && `${paper.level}-${paper.year}-${String(paper.month).padStart(2, '0')}-${paper.set_number}`
      if (actualId !== id) finish(new Error('试卷资源异常，请重新安装完整安装包'))
      else finish(null, paper)
    }
    script.onerror = () => finish(new Error('试卷资源加载失败，请重试或更新安装包'))
    timer = setTimeout(() => finish(new Error('试卷读取超时，请重试')), 12000)
    document.head.appendChild(script)
  }).finally(() => pending.delete(id))
  pending.set(id, request)
  return request
}

const words = /(?:[A-Za-z]\.){2,}|[A-Za-z]+(?:['’][A-Za-z]+)*(?:[-‑][A-Za-z]+(?:['’][A-Za-z]+)*)*/g

export function wordAt(text, offset) {
  for (const match of text.matchAll(words)) {
    if (offset >= match.index && offset < match.index + match[0].length) return { text: match[0], start: match.index, end: match.index + match[0].length }
  }
  return null
}

/** Conservative whole-sentence shortcut; native selection always remains adjustable. */
export function sentenceAt(text, start, end = start) {
  const boundaries = [0]
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\n' || /[!?]/.test(char) || (char === '.' && !/\d/.test(text[index + 1] || '') && !/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc)|\b[A-Za-z]|(?:\b[A-Za-z]\.)+[A-Za-z])$/i.test(text.slice(0, index)))) {
      let next = index + 1
      while (/[.!?"”’')\]]/.test(text[next] || '\0')) next++
      if (!text[next] || /\s/.test(text[next])) boundaries.push(next)
    }
  }
  boundaries.push(text.length)
  let left = 0, right = text.length
  for (const boundary of boundaries) { if (boundary <= start) left = boundary; if (boundary >= end && boundary > start) { right = boundary; break } }
  while (/\s/.test(text[left] || '\0') && left < right) left++
  while (/\s/.test(text[right - 1] || '\0') && right > left) right--
  return { text: text.slice(left, right), start: left, end: right }
}

export function rangeOffsets(element, range) {
  const prefix = document.createRange()
  prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset)
  return { start: prefix.toString().length, end: prefix.toString().length + range.toString().length }
}

export function textRange(element, start, end) {
  const range = document.createRange(), walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node, offset = 0, found = false
  while ((node = walker.nextNode())) {
    const next = offset + node.length
    if (!found && start < next) { range.setStart(node, Math.max(0, start - offset)); found = true }
    if (found && end <= next) { range.setEnd(node, Math.max(0, end - offset)); return range }
    offset = next
  }
  return null
}

export function wordFromPoint(element, x, y) {
  let caret
  if (document.caretRangeFromPoint) caret = document.caretRangeFromPoint(x, y)
  else if (document.caretPositionFromPoint) {
    const point = document.caretPositionFromPoint(x, y)
    if (point) { caret = document.createRange(); caret.setStart(point.offsetNode, point.offset); caret.collapse(true) }
  }
  if (!caret || !element.contains(caret.startContainer)) return null
  const { start } = rangeOffsets(element, caret)
  // A caret is between characters; verify the actual word rectangles below.
  const candidates = [wordAt(element.textContent, start), wordAt(element.textContent, start - 1)].filter(Boolean)
  for (const word of candidates) {
    const range = textRange(element, word.start, word.end)
    if (range && [...range.getClientRects()].some(rect => x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1)) return { ...word, range }
  }
  return null
}

import { reactive } from 'vue'
export const feedback = reactive({ modal: null, toast: '' })
let timer
export function showToast(title) {
  clearTimeout(timer)
  feedback.toast = title
  timer = setTimeout(() => { feedback.toast = '' }, 2200)
}
export function showModal(options) { feedback.modal = options }
export function resolveModal(confirm) {
  const options = feedback.modal
  feedback.modal = null
  options?.success?.({ confirm, cancel: !confirm })
}

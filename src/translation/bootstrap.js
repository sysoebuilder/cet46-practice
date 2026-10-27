import { installReadingTranslation } from './reading-translation.js'
import translator from './translator.mjs'
import './translation.css'

// Available to existing HTML5+ business code; no lifecycle tied to a reading page.
window.translator = translator
const dispose = installReadingTranslation()
if (import.meta.hot) import.meta.hot.dispose(dispose)

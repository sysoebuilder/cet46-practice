// Physics shared by every interaction. Distances are deliberately small.
export const springSnappy = { type: 'spring', stiffness: 540, damping: 34, mass: 0.7 }
export const springSmooth = { type: 'spring', stiffness: 290, damping: 32, mass: 1 }
export const springSheet = { type: 'spring', stiffness: 360, damping: 36, mass: 1.05 }
export const fadeSlide = { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
export const staggerChildren = 0.028
export const startupMotion = {
  settleMs: 340,
  exit: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  travel: { duration: 1.15, ease: 'easeInOut', repeat: Infinity },
}
export const loadingPulse = { duration: 1.35, ease: 'easeInOut', repeat: Infinity }
export const contentVariants = reduced => ({
  enter: direction => ({ x: reduced.value ? 0 : direction * 22, opacity: 0 }),
  visible: { x: 0, opacity: 1 },
  exit: direction => ({ x: reduced.value ? 0 : direction * -16, opacity: 0 }),
})

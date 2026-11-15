import { useEffect } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

export function useScrollProgress() {
  const progress = useMotionValue(0)
  const smoothProgress = useSpring(progress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })

  useEffect(() => {
    const updateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const total = scrollHeight - clientHeight
      if (total > 0) {
        progress.set(scrollTop / total)
      }
    }

    window.addEventListener('scroll', updateProgress, { passive: true })
    updateProgress()
    return () => window.removeEventListener('scroll', updateProgress)
  }, [progress])

  return smoothProgress
}

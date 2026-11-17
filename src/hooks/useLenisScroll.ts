import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

gsap.registerPlugin(ScrollTrigger)

export function useLenisScroll() {
  const lenisRef = useRef<InstanceType<typeof Lenis> | null>(null)

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    })

    lenisRef.current = lenis

    // Sync Lenis with GSAP ScrollTrigger
    const handleScroll = ScrollTrigger.update
    const handleTick = (time: number) => {
      lenis.raf(time * 1000)
    }
    lenis.on('scroll', handleScroll)
    gsap.ticker.add(handleTick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.off('scroll', handleScroll)
      gsap.ticker.remove(handleTick)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return lenisRef
}

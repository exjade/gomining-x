import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

gsap.registerPlugin(ScrollTrigger)

export function useLenisScroll() {
  const lenisRef = useRef<InstanceType<typeof Lenis> | null>(null)

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        window.matchMedia('(pointer: coarse)').matches)
    ) {
      return
    }

    const lenis = new Lenis({
      lerp: 0.14,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1.05,
      touchMultiplier: 1.5,
    })

    lenisRef.current = lenis

    // Only invoke GSAP ScrollTrigger.update if triggers are actually registered
    const handleScroll = () => {
      if (ScrollTrigger.getAll().length > 0) {
        ScrollTrigger.update()
      }
    }
    const handleTick = (time: number) => {
      lenis.raf(time * 1000)
    }
    lenis.on('scroll', handleScroll)
    gsap.ticker.add(handleTick)
    gsap.ticker.lagSmoothing(500, 33)

    return () => {
      lenis.off('scroll', handleScroll)
      gsap.ticker.remove(handleTick)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return lenisRef
}

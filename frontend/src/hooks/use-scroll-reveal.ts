import { useEffect, useRef } from 'react'

/**
 * Reveals `.reveal` descendants as they scroll into view by adding the `in`
 * class the stylesheet already defines. It never leaves content hidden:
 * browsers without IntersectionObserver, and users who ask for reduced motion,
 * get the revealed state immediately.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'))
    if (targets.length === 0) return

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      for (const target of targets) target.classList.add('in')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    )
    for (const target of targets) observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return ref
}

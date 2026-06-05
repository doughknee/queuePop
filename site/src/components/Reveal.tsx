import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  /** Stagger delay in ms. */
  delay?: number
  as?: 'div' | 'section' | 'li' | 'article'
}

/** Fades + lifts its children into view once, via IntersectionObserver. */
export function Reveal({ children, className = '', delay = 0, as = 'div' }: Props) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}

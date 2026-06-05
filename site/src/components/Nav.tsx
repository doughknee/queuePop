import { useEffect, useState } from 'react'
import { LINKS } from '../data/content'
import { Wordmark, BtnPrimary, DonateLink } from './ui'
import { Icon } from './icons'
import { Mark } from './Mark'

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-gold5/30 bg-hextech-black/80 backdrop-blur-md'
          : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="group flex items-center gap-2.5">
          <Mark className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" live />
          <Wordmark className="text-[19px]" />
        </a>

        <nav className="hidden items-center gap-9 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="nav-link font-display text-[12px] uppercase tracking-[0.16em] text-grey1 transition-colors hover:text-gold1"
            >
              {n.label}
            </a>
          ))}
          <a
            href={LINKS.github}
            target="_blank"
            rel="noreferrer"
            className="text-grey1 transition-colors hover:text-gold1"
            aria-label="queuePop on GitHub"
          >
            <Icon.github width={20} height={20} />
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <DonateLink href={LINKS.donate} className="hidden sm:inline-flex" />
          <BtnPrimary href={LINKS.download} icon={<Icon.windows width={16} height={16} />}>
            Download
          </BtnPrimary>
        </div>
      </div>
    </header>
  )
}

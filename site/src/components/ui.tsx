import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Icon } from './icons'

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`select-none font-display uppercase tracking-[0.16em] text-gold1 ${className}`}
      style={{ fontWeight: 700 }}
    >
      queue<span className="text-gold2">Pop</span>
    </span>
  )
}

type LinkBtnProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode
  icon?: ReactNode
}

/** Solid-gold primary CTA, sharp notched corners, ignites teal on hover. */
export function BtnPrimary({ children, icon, className = '', ...rest }: LinkBtnProps) {
  return (
    <a
      {...rest}
      className={`btn-hex inline-flex items-center justify-center gap-2.5 bg-gold2 px-6 py-3 font-display text-[13px] uppercase tracking-[0.18em] text-hextech-black shadow-[inset_0_0_0_1px_rgba(1,10,19,0.22)] hover:bg-gold1 hover:shadow-[inset_0_0_0_1px_rgba(1,10,19,0.28),0_0_28px_-4px_rgba(10,200,185,0.6)] ${className}`}
    >
      {icon}
      <span>{children}</span>
    </a>
  )
}

/** Outlined ghost CTA, notched, hairline gold frame, teal glow on hover. */
export function BtnGhost({ children, icon, className = '', ...rest }: LinkBtnProps) {
  return (
    <a
      {...rest}
      className={`btn-hex inline-flex items-center justify-center gap-2.5 bg-hextech-black/40 px-6 py-3 font-display text-[13px] uppercase tracking-[0.18em] text-gold1 shadow-[inset_0_0_0_1px_rgba(200,170,110,0.4)] hover:bg-hextech-black/60 hover:shadow-[inset_0_0_0_1px_rgba(200,170,110,0.9),0_0_22px_-6px_rgba(10,200,185,0.5)] ${className}`}
    >
      {icon}
      <span>{children}</span>
    </a>
  )
}

/** Compact teal-accent tip-jar chip, notched to match the CTAs. */
export function DonateLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`btn-hex inline-flex items-center gap-2 bg-hextech-black/40 px-4 py-2.5 font-display text-[11px] uppercase tracking-[0.18em] text-blue1 shadow-[inset_0_0_0_1px_rgba(10,200,185,0.35)] hover:shadow-[inset_0_0_0_1px_rgba(10,200,185,0.75),0_0_18px_-6px_rgba(10,200,185,0.6)] ${className}`}
    >
      <Icon.heart width={14} height={14} className="text-blue2" />
      <span>Tip Jar</span>
    </a>
  )
}

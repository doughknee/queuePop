import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const Icon = {
  bolt: (p: IconProps) => (
    <svg {...base(p)}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
  ),
  target: (p: IconProps) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  loadout: (p: IconProps) => (
    <svg {...base(p)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" /><path d="M14.5 17h6M17.5 14v6" />
    </svg>
  ),
  swap: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>
  ),
  live: (p: IconProps) => (
    <svg {...base(p)}>
      <rect x="3" y="5" width="18" height="13" rx="1.5" /><path d="M3 9h18M7 13h4M7 15.5h7" /><circle cx="16.5" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  phone: (p: IconProps) => (
    <svg {...base(p)}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10.5 18.5h3" /><path d="M19 7c1.2 1.5 1.2 9 0 0" opacity=".0" />
    </svg>
  ),
  discord: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M8 7.5c2.6-1 5.4-1 8 0M8 16.5c2.6 1 5.4 1 8 0" />
      <path d="M8 7.5C5.5 8 4 10 3.6 13.5c-.2 1.6.2 3 1.4 4 1 .8 2 .2 2.4-.8M16 7.5c2.5.5 4 2.5 4.4 6 .2 1.6-.2 3-1.4 4-1 .8-2 .2-2.4-.8" />
      <circle cx="9.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  rank: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 13v3M9 20h6M10 20l.6-2.4h2.8L14 20" />
    </svg>
  ),
  github: (p: IconProps) => (
    <svg {...base(p)} strokeWidth={0} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  ),
  windows: (p: IconProps) => (
    <svg {...base(p)} strokeWidth={0} fill="currentColor">
      <path d="M3 5.6 10.4 4.6v6.7H3V5.6Zm0 12.8 7.4 1V13H3v5.4ZM11.4 13v6.6L21 21v-8H11.4Zm0-8.6V11H21V3l-9.6 1.4Z" />
    </svg>
  ),
  heart: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 20s-7-4.3-9.2-8.4C1.2 8.3 2.9 5 6 5c2 0 3.2 1.4 4 2.6C10.8 6.4 12 5 14 5c3.1 0 4.8 3.3 3.2 6.6C19 15.7 12 20 12 20Z" /></svg>
  ),
  check: (p: IconProps) => (
    <svg {...base(p)}><path d="m4 12.5 5 5 11-12" /></svg>
  ),
  chevron: (p: IconProps) => (
    <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
  ),
  spark: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
  ),
  shield: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  arrow: (p: IconProps) => (
    <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
}

export type IconName = keyof typeof Icon

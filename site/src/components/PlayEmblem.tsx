type Props = {
  label?: string
  className?: string
  /** When true the emblem glows teal and pulses, like the in-queue state. */
  live?: boolean
}

/**
 * Recreation of design/play-button.svg as a self-contained component.
 * Resting state is bronze/dark-teal; on hover (or `live`) the ring and play
 * triangle ignite to gold and the banner frame shifts to bright teal, exactly
 * the swap the app performs in CSS.
 */
export function PlayEmblem({ label = 'PLAY', className = '', live = false }: Props) {
  return (
    <span className={`pe ${live ? 'pe-live' : ''} ${className}`}>
      <svg viewBox="0 0 232 60" width="232" height="60" role="img" aria-label={`${label} button`}>
        <defs>
          <radialGradient id="peFill" cx="50%" cy="40%" r="62%">
            <stop offset="0.1" stopColor="#0a323c" />
            <stop className="pe-grad-end" offset="1" stopColor="#005a82" />
          </radialGradient>
        </defs>

        {/* Banner, outer frame, inner fill, end cap */}
        <path
          className="pe-frame"
          fill="#005a82"
          d="M64 8 H196 l30 22 -30 22 H64 q18-22 0-44 Z"
        />
        <path fill="#1e2328" d="M69 12 H193 l25 18 -25 18 H69 q15-18 0-36 Z" />
        <text
          x="138" y="35"
          fontFamily="Marcellus, Georgia, serif"
          fontSize="20" fontWeight="700" letterSpacing="2"
          textAnchor="middle" fill="#f0e6d2"
        >
          {label}
        </text>

        {/* Emblem, ring, black rim, radial fill, play triangle */}
        <circle className="pe-ring" cx="30" cy="30" r="27" fill="#785a28" />
        <circle cx="30" cy="30" r="24" fill="#010a13" />
        <circle cx="30" cy="30" r="22" fill="url(#peFill)" />
        <path className="pe-ico" fill="#785a28" d="M25 20 v20 l16 -10 Z" />
      </svg>

      <style>{`
        .pe { display:inline-flex; line-height:0; filter: drop-shadow(0 4px 12px rgba(0,0,0,.45)); }
        .pe svg { overflow: visible; }
        .pe .pe-ring, .pe .pe-ico { transition: fill .25s ease; }
        .pe .pe-frame, .pe .pe-grad-end { transition: fill .25s ease, stop-color .25s ease; }
        .pe:hover .pe-ring, .pe:hover .pe-ico,
        .pe-live .pe-ring, .pe-live .pe-ico { fill: #C8AA6E; }
        .pe:hover .pe-frame, .pe-live .pe-frame { fill: #0AC8B9; }
        .pe:hover .pe-grad-end, .pe-live .pe-grad-end { stop-color: #0AC8B9; }
        .pe-live { animation: peGlow 2.2s ease-in-out infinite; }
        @keyframes peGlow {
          0%,100% { filter: drop-shadow(0 0 4px rgba(10,200,185,.25)) drop-shadow(0 4px 12px rgba(0,0,0,.45)); }
          50%     { filter: drop-shadow(0 0 16px rgba(10,200,185,.55)) drop-shadow(0 4px 12px rgba(0,0,0,.45)); }
        }
        @media (prefers-reduced-motion: reduce) { .pe-live { animation: none; } }
      `}</style>
    </span>
  )
}

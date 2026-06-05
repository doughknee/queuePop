type Props = {
  className?: string
  /** Always-on live state (gold + teal glow), otherwise ignites on hover. */
  live?: boolean
  title?: string
}

/**
 * The queuePop "Queue Sigil", a gold hex ring with a glowing teal core and a
 * play/cursor pennant. Geometry ported from brand/svg/mark-*.svg.
 * Resting = bronze; hover (or `live`) ignites to gold + teal with a soft glow.
 */
export function Mark({ className = '', live = false, title = 'queuePop' }: Props) {
  return (
    <span className={`qmark ${live ? 'qmark-live' : ''} ${className}`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-label={title}>
        <defs>
          <radialGradient id="qmGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0AC8B9" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0AC8B9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="qm-glow" cx="56" cy="54" r="26" fill="url(#qmGlow)" />
        <polygon
          className="qm-ring"
          points="96,54 84.28,82.28 56,94 27.72,82.28 16,54 27.72,25.72 56,14 84.28,25.72"
          fill="none" stroke="#785A28" strokeWidth="8" strokeLinejoin="miter"
        />
        <polygon
          points="80,54 72.97,70.97 56,78 39.03,70.97 32,54 39.03,37.03 56,30 72.97,37.03"
          fill="none" stroke="#785A28" strokeWidth="1.6" strokeLinejoin="miter" opacity="0.65"
        />
        <circle className="qm-core" cx="56" cy="54" r="6.5" fill="#005A82" />
        <polygon
          className="qm-pennant"
          points="74,71 78,99 105,85"
          fill="#785A28" stroke="none"
        />
        <polygon className="qm-pennant-hi" points="74,71 78,85 105,85" fill="#F0E6D2" opacity="0" />
      </svg>

      <style>{`
        .qmark { display:inline-block; line-height:0; }
        .qmark svg { overflow: visible; }
        .qm-glow { opacity: 0; transition: opacity .25s ease; }
        .qm-ring, .qm-pennant { transition: stroke .25s ease, fill .25s ease; }
        .qm-core { transition: fill .25s ease; }
        .qmark:hover .qm-ring, .qmark-live .qm-ring { stroke: #C8AA6E; }
        .qmark:hover .qm-core, .qmark-live .qm-core { fill: #0AC8B9; }
        .qmark:hover .qm-pennant, .qmark-live .qm-pennant { fill: #C8AA6E; }
        .qmark:hover .qm-pennant-hi, .qmark-live .qm-pennant-hi { opacity: .20; }
        .qmark:hover .qm-glow, .qmark-live .qm-glow { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .qm-glow, .qm-ring, .qm-pennant, .qm-core, .qm-pennant-hi { transition: none; }
        }
      `}</style>
    </span>
  )
}

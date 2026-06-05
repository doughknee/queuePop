const MODES = [
  'Ranked Solo/Duo',
  'Ranked Flex',
  'Draft Pick',
  'Quickplay',
  'ARAM',
  'Arena',
  'TFT Ranked',
  'TFT Double Up',
  'Hyper Roll',
  'Tocker’s Trials',
  'Blind Pick',
]

export function Marquee() {
  const row = [...MODES, ...MODES]
  return (
    <div className="relative overflow-hidden border-y border-gold5/15 py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0a1626] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0a1626] to-transparent" />
      <div className="flex w-max animate-[marq_38s_linear_infinite] items-center gap-10">
        {row.map((m, i) => (
          <span key={i} className="flex items-center gap-10 whitespace-nowrap">
            <span className="font-display text-[12px] uppercase tracking-[0.22em] text-subtext">
              {m}
            </span>
            <span className="h-1.5 w-1.5 rotate-45 bg-gold5" />
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce){ .animate-\\[marq_38s_linear_infinite\\]{ animation: none; } }
      `}</style>
    </div>
  )
}

import { Shot } from './Shot'
import { Reveal } from './Reveal'

const SHOTS = [
  {
    src: '/shots/settings.png',
    alt: 'queuePop settings, auto pick/ban toggles, phone companion, and Discord webhook',
    caption: 'Every toggle in one place',
    sub: 'Auto pick/ban, instant-lock, trades, ARAM bench, phone alerts, and Discord, all opt-in.',
    glow: 'teal' as const,
  },
  {
    src: '/shots/queue.png',
    alt: 'queuePop PLAY menu, one-click queue launcher with pinned favorites',
    caption: 'Queue in one click',
    sub: 'Pin your favorite modes, Rift, ARAM, every TFT queue, and launch straight from the app.',
    glow: 'gold' as const,
  },
  {
    src: '/shots/profile.png',
    alt: 'queuePop profile, live rank, champion mastery, and recent match history',
    caption: 'Your climb at a glance',
    sub: 'Live rank and LP, champion mastery, and recent matches, pulled straight from your client.',
    glow: 'teal' as const,
  },
]

export function Gallery() {
  return (
    <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="kicker">A real app, not a concept</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">Built to get out of your way</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-grey1">
          Set it up once, then forget it's there. queuePop lives in your tray and
          only acts on the queues and champions you tell it to.
        </p>
        <div className="rule-diamond mx-auto mt-8 w-40" />
      </Reveal>

      <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {SHOTS.map((s, i) => (
          <Reveal key={s.src} delay={i * 110}>
            <Shot src={s.src} alt={s.alt} glow={s.glow} />
            <div className="mt-5">
              <h3 className="font-display text-[16px] uppercase tracking-[0.08em] text-gold1">
                {s.caption}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-grey1">{s.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

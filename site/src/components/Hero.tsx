import { LINKS } from '../data/content'
import { BtnPrimary, BtnGhost } from './ui'
import { Icon } from './icons'
import { Shot } from './Shot'

const BADGES = [
  'Free & open source',
  'No telemetry',
  'Windows',
  'Official LCU API',
  'No input hijacking',
]

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-20 sm:pt-36 lg:pb-28">
      {/* Ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow-teal breathe absolute -top-24 right-[8%] h-[34rem] w-[34rem]" />
        <div className="glow-gold breathe-slow absolute top-40 -left-24 h-[30rem] w-[30rem]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(200,170,110,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(200,170,110,.6) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 80%)',
          }}
        />
        <span className="spark" style={{ left: '12%', top: '62%', animationDelay: '0s' }} />
        <span className="spark gold" style={{ left: '26%', top: '78%', animationDelay: '1.6s' }} />
        <span className="spark" style={{ left: '51%', top: '70%', animationDelay: '3.1s' }} />
        <span className="spark gold" style={{ left: '69%', top: '82%', animationDelay: '2.3s' }} />
        <span className="spark" style={{ left: '84%', top: '64%', animationDelay: '4.2s' }} />
        <span className="spark" style={{ left: '41%', top: '86%', animationDelay: '5.6s' }} />
      </div>

      <div className="mx-auto grid max-w-[88rem] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.78fr_1.22fr]">
        {/* Left, pitch */}
        <div>
          <div className="mb-6 inline-flex items-center gap-2 border border-gold5/40 bg-hextech-black/40 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue2 dot-pulse" />
            <span className="kicker !tracking-[0.22em]">League of Legends &amp; TFT companion</span>
          </div>

          <h1 className="text-[2.6rem] leading-[1.05] sm:text-6xl">
            Your queue,
            <br />
            <span className="text-shimmer bg-gradient-to-r from-gold1 via-gold2 to-gold4 bg-clip-text text-transparent">
              on autopilot.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-grey1">
            queuePop accepts the Ready Check the instant it pops, hovers and locks
            your picks, sets your spells, runes, and skin per champion, and pings
            your phone when the match is live. You just play.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <BtnPrimary
              href={LINKS.download}
              icon={<Icon.windows width={17} height={17} />}
              className="px-7 py-3.5 text-sm"
            >
              Download for Windows
            </BtnPrimary>
            <BtnGhost
              href={LINKS.github}
              icon={<Icon.github width={17} height={17} />}
              className="px-7 py-3.5 text-sm"
            >
              View source
            </BtnGhost>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5">
            {BADGES.map((b) => (
              <li key={b} className="flex items-center gap-2 text-[13px] text-subtext">
                <Icon.check width={15} height={15} className="text-blue2" />
                {b}
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-md text-[11.5px] leading-relaxed text-grey2">
            Independent fan project, not affiliated with or endorsed by Riot Games.
          </p>
        </div>

        {/* Right, the real app */}
        <HeroShot />
      </div>
    </section>
  )
}

function HeroShot() {
  return (
    <div className="relative mx-auto w-full max-w-none">
      <Shot
        src="/shots/dashboard.png"
        alt="queuePop dashboard, monitoring status, ranked overview, and live activity feed"
        glow="teal"
        priority
      />
      {/* Floating phone-alert chip */}
      <div className="hextech absolute -bottom-5 -left-5 hidden items-center gap-2.5 px-3.5 py-2.5 sm:flex">
        <Icon.phone width={18} height={18} className="text-blue2" />
        <span className="text-[12px] text-grey1">Phone alert sent</span>
      </div>
      {/* Floating "auto-accept" chip */}
      <div className="hextech absolute -top-4 -right-4 hidden items-center gap-2.5 px-3.5 py-2.5 lg:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-blue2 dot-pulse" />
        <span className="text-[12px] text-grey1">Queue auto-accepted</span>
      </div>
    </div>
  )
}


import type { ReactNode } from 'react'
import { Icon } from './icons'
import { Reveal } from './Reveal'
import { Shot } from './Shot'

export function DeepDives() {
  return (
    <div className="mx-auto max-w-[88rem] space-y-28 px-5 py-28 sm:px-8">
      <Row
        kicker="Champion select, automated"
        title="It plays the pick/ban for you"
        points={[
          'Per-role ban and pick lists with ordered backups when a champ is taken',
          'Hovers early to signal intent, then locks instantly or just before the timer',
          'Auto-trades for higher-priority champs and grabs ARAM bench upgrades',
        ]}
        mock={
          <Shot
            src="/shots/champ-select.png"
            alt="queuePop champion select, pick list with numbered priority order per role"
            glow="teal"
          />
        }
      />
      <Row
        reverse
        kicker="Set it once"
        title="A full loadout for every champion"
        points={[
          'Summoner spells per champion, per role, Flash always on the right side',
          'Recommended runes on lock-in, or your own saved page',
          'Pick a skin, or let it surprise you from your owned favorites',
        ]}
        mock={
          <Shot
            src="/shots/loadout.png"
            alt="queuePop per-champion loadout editor, summoner spells, runes, and skin selection"
            glow="gold"
          />
        }
      />
      <Row
        kicker="Never miss a pop"
        title="Your phone is the second screen"
        points={[
          'Open one page on your phone, no app install, just your home Wi-Fi',
          'Alarms the instant queue pops, with built-in or custom sounds',
          'Discord webhook pings with an optional @mention as a backup',
        ]}
        mock={<MockCompanion />}
      />
    </div>
  )
}

function Row({
  kicker,
  title,
  points,
  mock,
  reverse = false,
}: {
  kicker: string
  title: string
  points: string[]
  mock: ReactNode
  reverse?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-10 lg:items-center lg:gap-16 ${
        reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'
      }`}
    >
      <Reveal className="min-w-0 lg:basis-[36%]">
        <p className="kicker">{kicker}</p>
        <h2 className="mt-3 text-3xl leading-tight sm:text-4xl">{title}</h2>
        <ul className="mt-7 space-y-4">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-grey1">
              <Icon.check width={20} height={20} className="mt-0.5 shrink-0 text-blue2" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={120} className="min-w-0 lg:basis-[64%]">
        {mock}
      </Reveal>
    </div>
  )
}

/* ────────────────────────────── Mock: phone companion ────────────────────── */
function MockCompanion() {
  return (
    <div className="relative mx-auto flex max-w-md items-center justify-center gap-6">
      <div className="glow-teal absolute -inset-5 -z-10" />

      {/* QR / pairing card */}
      <div className="hextech hidden p-4 sm:block">
        <div
          className="h-28 w-28"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #c9bf96 0 4px, transparent 4px 8px), repeating-linear-gradient(90deg, #010a13 0 4px, transparent 4px 8px)',
            backgroundColor: '#0a1428',
            maskImage:
              'radial-gradient(circle at 18% 18%, #000 9%, transparent 10%), radial-gradient(circle at 82% 18%, #000 9%, transparent 10%), radial-gradient(circle at 18% 82%, #000 9%, transparent 10%), linear-gradient(#000,#000)',
          }}
          aria-hidden
        />
        <p className="mt-3 text-center text-[10.5px] uppercase tracking-[0.16em] text-subtext">
          Scan to pair
        </p>
      </div>

      {/* Phone */}
      <div className="relative w-44 shrink-0 rounded-[1.8rem] border-2 border-gold5/50 bg-hextech-black/80 p-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-grey3" />
        <div className="space-y-3 rounded-[1.3rem] border border-gold5/25 bg-[#0a1626] p-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] uppercase tracking-[0.14em] text-gold1">
              queuePop
            </span>
            <span className="h-2 w-2 rounded-full bg-blue2 dot-pulse" />
          </div>
          <div className="framed border border-blue4/50 bg-blue7/60 p-3 text-center">
            <Icon.bolt width={22} height={22} className="mx-auto text-blue2" />
            <p className="mt-1.5 font-display text-[12px] uppercase tracking-[0.12em] text-gold1">
              Queue ready!
            </p>
            <p className="text-[10.5px] text-subtext">ARAM · tap to dismiss</p>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-subtext">
            <Icon.phone width={12} height={12} className="text-blue2" /> Connected
          </div>
        </div>
      </div>
    </div>
  )
}

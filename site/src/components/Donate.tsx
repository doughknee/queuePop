import { LINKS } from '../data/content'
import { BtnPrimary, BtnGhost } from './ui'
import { Icon } from './icons'
import { Reveal } from './Reveal'

export function Donate() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <div className="framed hextech-strong relative overflow-hidden px-6 py-16 text-center sm:px-12">
          <div className="glow-gold absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2" />
          <span className="relative mx-auto mb-6 grid h-14 w-14 place-items-center border border-gold2/60 bg-hextech-black/60 text-gold2">
            <Icon.heart width={26} height={26} />
          </span>
          <h2 className="relative text-3xl sm:text-4xl">Free forever. Fueled by tips.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-grey1">
            queuePop will always be free and open source. If it has saved you a few
            hundred Ready Checks, a small tip keeps the updates coming, entirely
            optional, no features locked behind it.
          </p>
          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
            <BtnPrimary
              href={LINKS.donate}
              icon={<Icon.heart width={16} height={16} />}
              className="px-7 py-3.5 text-sm"
            >
              Leave a tip
            </BtnPrimary>
            <BtnGhost
              href={LINKS.download}
              icon={<Icon.windows width={16} height={16} />}
              className="px-7 py-3.5 text-sm"
            >
              Just download it
            </BtnGhost>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

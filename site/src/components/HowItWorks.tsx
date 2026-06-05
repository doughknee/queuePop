import { STEPS } from '../data/content'
import { Reveal } from './Reveal'

export function HowItWorks() {
  return (
    <section id="how" className="relative scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="kicker">Up and running in a minute</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">How it works</h2>
        </Reveal>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* connecting line */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-9 hidden h-px md:block"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(120,90,40,.55) 12%, rgba(120,90,40,.55) 88%, transparent)',
            }}
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110} className="relative">
              <div className="relative">
                <div className="relative z-10 mx-auto grid h-16 w-16 place-items-center">
                  <span className="absolute inset-0 rotate-45 border border-gold2/60 bg-[#0a1626]" />
                  <span className="relative font-display text-lg font-bold text-gold2">{s.n}</span>
                </div>
                <h3 className="mt-6 text-center font-display text-lg uppercase tracking-[0.1em] text-gold1">
                  {s.title}
                </h3>
                <p className="mx-auto mt-3 max-w-xs text-center text-[14px] leading-relaxed text-grey1">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

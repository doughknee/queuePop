import { FAQ } from '../data/content'
import { Icon } from './icons'
import { Reveal } from './Reveal'

export function Faq() {
  return (
    <section id="faq" className="relative scroll-mt-20 py-24">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal className="text-center">
          <p className="kicker">Straight answers</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">Questions, honestly answered</h2>
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 50}>
              <details className="hextech group p-0 [&_summary]:list-none">
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                  <span className="font-display text-[15px] tracking-[0.02em] text-gold1">
                    {item.q}
                  </span>
                  <Icon.chevron
                    width={18}
                    height={18}
                    className="shrink-0 text-gold2 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="border-t border-gold5/20 px-5 py-4 text-[14px] leading-relaxed text-grey1">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

import { FEATURES } from '../data/content'
import { Icon, type IconName } from './icons'
import { Reveal } from './Reveal'

export function FeatureGrid() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="kicker">Everything in one place</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">More than auto-accept</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-grey1">
          queuePop reads your client through the official LCU API and handles the
          tedious half of every game, from the Ready Check to lock-in.
        </p>
        <div className="rule-diamond mx-auto mt-8 w-40" />
      </Reveal>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          const Glyph = Icon[f.icon as IconName]
          return (
            <Reveal as="article" key={f.title} delay={(i % 4) * 70} className="h-full">
              <div className="hextech framed group h-full p-5 hover:-translate-y-1">
                <span className="mb-4 grid h-11 w-11 place-items-center border border-gold5/40 bg-hextech-black/60 text-gold2 transition duration-200 group-hover:scale-110 group-hover:border-gold2 group-hover:text-gold1">
                  <Glyph width={22} height={22} />
                </span>
                <h3 className="font-display text-[15px] uppercase tracking-[0.08em] text-gold1">
                  {f.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-grey1">{f.body}</p>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

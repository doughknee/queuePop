import { Icon, type IconName } from './icons'
import { Reveal } from './Reveal'

const POINTS = [
  {
    icon: 'shield',
    title: 'No telemetry, ever',
    body: 'No analytics, no tracking, no usage data. queuePop never reports anything about you or how you play.',
  },
  {
    icon: 'check',
    title: 'No account, no sign-up',
    body: 'There is nothing to register for and no login. It just runs when you open it.',
  },
  {
    icon: 'bolt',
    title: 'Local-first',
    body: 'It talks to your own League client over Riot’s official LCU API. Your stats, picks, and config never leave your PC.',
  },
  {
    icon: 'github',
    title: 'Open source',
    body: 'Every line is on GitHub. Do not take my word for it, read it, build it, audit it yourself.',
  },
] as const

export function Privacy() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="kicker">Yours alone</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">Private by default.</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-grey1">
          queuePop is a local tool, not a service. Nothing about you gets collected,
          and there is no server in the middle.
        </p>
        <div className="rule-diamond mx-auto mt-8 w-40" />
      </Reveal>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p, i) => {
          const Glyph = Icon[p.icon as IconName]
          return (
            <Reveal as="article" key={p.title} delay={(i % 4) * 70} className="h-full">
              <div className="hextech framed group h-full p-5 hover:-translate-y-1">
                <span className="mb-4 grid h-11 w-11 place-items-center border border-gold5/40 bg-hextech-black/60 text-blue2 transition duration-200 group-hover:scale-110 group-hover:border-blue2 group-hover:text-blue1">
                  <Glyph width={22} height={22} />
                </span>
                <h3 className="font-display text-[15px] uppercase tracking-[0.08em] text-gold1">
                  {p.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-grey1">{p.body}</p>
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal>
        <p className="mx-auto mt-10 max-w-2xl text-center text-[13px] leading-relaxed text-grey2">
          For full transparency: the only outbound connections are ones you choose.
          The optional Discord ping you set up, and a quick check to GitHub for
          updates when you launch. That is the whole list.
        </p>
      </Reveal>
    </section>
  )
}

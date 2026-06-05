import { LINKS, DISCLAIMER } from '../data/content'
import { Wordmark, DonateLink } from './ui'
import { Icon } from './icons'

export function Footer() {
  return (
    <footer className="border-t border-gold5/30 bg-hextech-black/70">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <Wordmark className="text-xl" />
            <p className="mt-2 max-w-sm text-[13px] text-grey1">
              Your League &amp; TFT queue, on autopilot. Free and open source.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a
              href={LINKS.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[13px] text-grey1 transition-colors hover:text-gold1"
            >
              <Icon.github width={18} height={18} /> GitHub
            </a>
            <a
              href={LINKS.releases}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[13px] text-grey1 transition-colors hover:text-gold1"
            >
              <Icon.windows width={16} height={16} /> Releases
            </a>
            <DonateLink href={LINKS.donate} />
          </div>
        </div>

        <div className="rule-diamond my-9" />

        <div className="flex flex-col gap-4 text-[12px] text-grey2 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl leading-relaxed">{DISCLAIMER}</p>
          <p className="shrink-0">MIT Licensed · © {new Date().getFullYear()} queuePop</p>
        </div>
      </div>
    </footer>
  )
}

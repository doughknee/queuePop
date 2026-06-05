import { Reveal } from './Reveal'

export function Origin() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
      <Reveal>
        <div className="border-l-2 border-gold5/50 pl-6 sm:pl-8">
          <p className="kicker">Why I built it</p>
          <div className="mt-5 space-y-4 text-[15.5px] leading-relaxed text-grey1">
            <p>
              A friend of mine had a baby and kept missing his queue pops while he
              was up doing chores or settling the little one. queuePop lets him lock
              in with friends, get as much done around the house as he can, and still
              drop into the game right on spawn.
            </p>
            <p>
              The other half is high-elo TFT, where queues can run 15 minutes or
              more. Being chained to the desk that whole time feels awful, and you
              start skipping a bathroom break just in case the game pops. Now I queue
              up, do a few minutes of real-life stuff, and get a clean alert the
              second my match is ready.
            </p>
            <p>
              That is the whole idea. If anything, I think it means fewer dodges and
              abandoned lobbies, not more.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

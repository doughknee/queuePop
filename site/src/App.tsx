// queuePop's public page (2026-10-22): what the store edition does, in its own words and screenshots. Every claim here has to
// be true of the Overwolf build (app/edition.js): it calls you back and highlights decisions, it never makes them.
const LINKS = {
  github: 'https://github.com/doughknee/queuePop',
  terms: '/terms.html',
  privacy: '/privacy.html',
}

const STEPS = [
  ['Queue up, then go', 'Start a queue and walk away. Grab a drink, do the dishes. queuePop is watching.'],
  ['It pops, you hear it', 'Your phone turns lime and rings, Discord pings, and Windows shows the pop, wherever you set it to reach you.'],
  ['Back at your desk', 'Accept in the League client. Your ban and pick are already hovered and the best picks for the draft are on screen. You lock in.'],
] as const

const FEATURES = [
  {
    id: 'draft',
    kicker: 'Champ select',
    title: 'Draft with the numbers',
    img: '/img/champ-select.webp', w: 1000, h: 796,
    alt: 'queuePop during champ select: both teams, your hovered pick, and the best picks for you against this draft',
    points: [
      'The five best picks for your role against what is already locked, and why: the matchup, the synergy, the games behind it.',
      'When it is your turn, your planned ban and pick are hovered for you. The lock-in is yours.',
      'Runes, summoner spells and skin set the moment you lock in.',
      'A game plan for your champion: core build, skill order, the matchups to watch.',
    ],
  },
  {
    id: 'stats',
    kicker: 'Stats',
    title: 'Every patch, three games',
    img: '/img/tier-list.webp', w: 1100, h: 796,
    alt: 'The League tier list in queuePop: tiers, win, pick and ban rates by champion and lane',
    points: [
      'League tier lists you can cut by lane, rank, region and patch, and champion pages with builds, runes and matchups.',
      'TFT comps, units and items, and Deadlock heroes and builds.',
      'Leaderboards and player lookups for League and TFT.',
      'Built from hundreds of thousands of ranked matches, refreshed as the patch goes on.',
    ],
  },
  {
    id: 'studio',
    kicker: 'Studio',
    title: 'Your games, on film',
    img: '/img/studio.webp', w: 1018, h: 432,
    alt: 'queuePop Studio: your latest game on a big screen with its clips underneath',
    points: [
      'Turn the recorder on and every game keeps a timeline of your kills, deaths and objectives.',
      'With video on, your best moments are cut into clips as you play: kills, multikills, objectives.',
      'Highlights puts your best plays first, and you can cut your own clip from any game you recorded with video.',
      'Everything stays on your PC, in a folder you choose, with a size cap you set.',
    ],
  },
] as const

const ALERTS = ['Your phone, on your Wi-Fi', 'ntfy push, even with the screen off', 'Discord', 'Windows notifications']

const FAIR = [
  ['It never decides for you', 'queuePop never accepts a queue, locks in a champion, grabs from the ARAM bench or sends a trade. It puts the right call in front of you; you make it.'],
  ['Nothing in game', 'No overlays while you play, no timers, no cooldown tracking, no "do this now" calls.'],
  ['Hands off the game', 'It talks to the League client through Riot’s own local APIs on your PC. It never reads game memory and never touches the game.'],
] as const

const FAQ = [
  ['When can I get it?', 'queuePop is on its way to the Overwolf app store. Like every third-party League app it needs Riot’s approval first, and it won’t ship without it. The source is on GitHub in the meantime.'],
  ['Does it accept the queue for me?', 'No. It makes sure you hear the pop wherever you are, and you accept on your PC, so you’re there for champ select. Nine players waiting on an empty seat isn’t a feature.'],
  ['Is it free?', 'Yes. The free version shows one ad in the app’s sidebar, never in game.'],
  ['Is it safe for my account?', 'It reads the League client’s local API and Riot’s live game data from your PC, the same data the client shows you. It never reads game memory, never injects anything, and never plays for you.'],
  ['What do I need?', 'Windows 10 or 11 and the League client. A phone on the same Wi-Fi for the phone companion. Deadlock pages need only your Steam account on that PC.'],
  ['Does it collect my data?', 'There’s no account and no tracking. Your settings and recordings stay on your PC; stats come from our stats service and Riot’s public game data. The ad is served by Overwolf. The privacy policy has the whole list.'],
] as const

function PhoneAlarm() {
  return (
    <div className="phone" role="img" aria-label="The phone companion when the queue pops: the screen turns lime with a countdown">
      <div className="phone-screen">
        <p className="phone-title">Queue<br />popped</p>
        <p className="phone-sub">Get back to your PC!</p>
        <p className="phone-kick">Ranked Solo/Duo</p>
        <span className="phone-btn">Silence</span>
        <span className="phone-btn ghost">Decline this match</span>
      </div>
    </div>
  )
}

export function App() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav">
        <a className="brand" href="/" aria-label="queuePop home">
          <img src="/logo.svg" alt="" width="28" height="28" />
          <span>Queue<b>Pop</b></span>
        </a>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#draft">Features</a>
          <a href="#fair">Plays fair</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="btn small" href="#get">Coming soon</a>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="kicker">For League of Legends, TFT and Deadlock</p>
            <h1>Walk away.<br /><em>We’ll call you back.</em></h1>
            <p className="lead">queuePop watches your queue while you’re away from your desk. When it pops, your phone rings, Discord pings and Windows tells you, so you’re back in time to accept. Then it helps you draft, shows you the stats, and records your best plays.</p>
            <div className="ctas">
              <a className="btn" href="#get">Coming to Overwolf</a>
              <a className="btn ghost" href="#how">How it works ↓</a>
            </div>
            <p className="facts">Free · Windows 10 and 11 · No account</p>
          </div>
          <div className="hero-art">
            <figure className="window">
              <img src="/img/activity.webp" alt="queuePop’s League page during a match: the queue popped, accept it in the client, then the game is about to start" width="1440" height="900" />
            </figure>
            <PhoneAlarm />
          </div>
        </section>

        <section className="alerts" aria-label="Where queuePop calls you">
          <p>It reaches you on</p>
          <ul>{ALERTS.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>

        <section id="how" className="how">
          <h2>How it works</h2>
          <ol className="steps">
            {STEPS.map(([t, b], i) => (
              <li key={t}><span className="num">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{b}</p></li>
            ))}
          </ol>
        </section>

        {FEATURES.map((f, i) => (
          <section key={f.id} id={f.id} className={`feature${i % 2 ? ' flip' : ''}`}>
            <div className="feature-copy">
              <p className="kicker">{f.kicker}</p>
              <h2>{f.title}</h2>
              <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <figure className="window">
              <img src={f.img} alt={f.alt} loading="lazy" width={f.w} height={f.h} />
            </figure>
          </section>
        ))}

        <section id="fair" className="fair">
          <p className="kicker">Plays fair</p>
          <h2>It calls you back.<br />You make the calls.</h2>
          <div className="cards">
            {FAIR.map(([t, b]) => <article key={t}><h3>{t}</h3><p>{b}</p></article>)}
          </div>
        </section>

        <section className="privacy">
          <div>
            <p className="kicker">Your data</p>
            <h2>No account. No tracking.</h2>
          </div>
          <ul>
            <li>Your settings, recordings and clips stay on your PC.</li>
            <li>Stats come from our stats service and Riot’s public game data.</li>
            <li>The free version shows one ad, served by Overwolf, with your consent where the law asks for it.</li>
            <li><a href={LINKS.privacy}>Read the privacy policy</a></li>
          </ul>
        </section>

        <section id="faq" className="faq">
          <h2>Questions</h2>
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </section>

        <section id="get" className="get">
          <h2>Coming to Overwolf</h2>
          <p>queuePop is on its way to the Overwolf app store. Until it lands, follow along on GitHub.</p>
          <a className="btn" href={LINKS.github}>queuePop on GitHub</a>
        </section>
      </main>

      <footer className="foot">
        <div className="foot-top">
          <a className="brand" href="/" aria-label="queuePop home"><img src="/logo.svg" alt="" width="24" height="24" /><span>Queue<b>Pop</b></span></a>
          <nav aria-label="Legal"><a href={LINKS.terms}>Terms of Use</a><a href={LINKS.privacy}>Privacy Policy</a><a href={LINKS.github}>GitHub</a></nav>
        </div>
        <p>queuePop isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, League of Legends and Teamfight Tactics are trademarks or registered trademarks of Riot Games, Inc. Deadlock and Steam are trademarks of Valve Corporation; queuePop isn’t affiliated with Valve.</p>
        <p>© 2026 Brandon Harris</p>
      </footer>
    </>
  )
}

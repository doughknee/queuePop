export const LINKS = {
  download: 'https://github.com/brandon-relentnet/queuePop/releases/latest',
  github: 'https://github.com/brandon-relentnet/queuePop',
  donate: 'https://buymeacoffee.com/doughknee',
  releases: 'https://github.com/brandon-relentnet/queuePop/releases',
} as const

export const FEATURES = [
  {
    icon: 'bolt',
    title: 'Instant Auto-Accept',
    body: 'The Ready Check is gone before you can blink. queuePop accepts the moment your match pops. Go grab a drink, it has the lobby.',
  },
  {
    icon: 'target',
    title: 'Auto Pick & Ban',
    body: 'Per-role ban and pick lists with ordered backups. It hovers early to signal intent, then locks instantly or right before the timer.',
  },
  {
    icon: 'loadout',
    title: 'Per-Champ Loadouts',
    body: 'Summoner spells, runes, and skin, set once per champion, per role. queuePop applies them automatically on lock-in.',
  },
  {
    icon: 'swap',
    title: 'Trades & ARAM Bench',
    body: 'Auto-requests trades for higher-priority champs and grabs upgrades off the ARAM reroll bench, in your preferred order.',
  },
  {
    icon: 'live',
    title: 'Live Champ-Select View',
    body: 'A real-time board of both teams: intents, locks, spells, skins, bans, pending trades, and a millisecond-accurate phase timer.',
  },
  {
    icon: 'phone',
    title: 'Phone Companion',
    body: 'Open one page on your phone, no install. It alarms the instant queue pops, with built-in or custom alert sounds.',
  },
  {
    icon: 'discord',
    title: 'Discord Pings',
    body: 'Webhook notifications with an optional @mention, so a queue pop buzzes your phone even when you have tabbed away.',
  },
  {
    icon: 'rank',
    title: 'Account Dashboard',
    body: 'Riot ID, level, Solo/Flex/TFT ranks, top mastery, recent matches, and one-click links to every major tracker.',
  },
] as const

export const STEPS = [
  {
    n: '01',
    title: 'Download & run',
    body: 'Grab the Windows build, run it, and it tucks itself into your system tray. No admin prompt, no clutter.',
  },
  {
    n: '02',
    title: 'It connects itself',
    body: 'queuePop talks to your running League client through the official LCU API, no screen-scraping, no mouse or keyboard hijacking.',
  },
  {
    n: '03',
    title: 'Set picks & queue up',
    body: 'Pick your champs, spells, runes, and skins per role. Hit queue. From the Ready Check to lock-in, queuePop handles it.',
  },
] as const

export const FAQ = [
  {
    q: 'Is it really free?',
    a: 'Yes. queuePop is free and open source under the MIT license. If it saves you a few hundred Ready Checks and you want to say thanks, there is a tip jar, but nothing is gated behind it.',
  },
  {
    q: 'Is this an official Riot Games product?',
    a: 'No. queuePop is an independent, fan-made tool. It is not made by, endorsed by, affiliated with, or sponsored by Riot Games. League of Legends and Riot Games are trademarks of Riot Games, Inc.',
  },
  {
    q: 'Will I get banned? Is this against the Terms of Service?',
    a: 'Be aware of the risk and decide for yourself. queuePop uses only the official League Client (LCU) API, it never reads your screen or moves your mouse. That said, automating client actions such as accepting queues or locking picks falls outside what Riot officially sanctions, and Riot can change its stance at any time. Auto-accept is widely used; the deeper automation (auto pick/ban/lock, trades) carries more risk. Use it on an account you are comfortable using it on.',
  },
  {
    q: 'Does it work with TFT and ARAM?',
    a: 'Yes. queuePop detects the mode: Summoner’s Rift, ARAM, Arena, and every TFT queue (Normal, Ranked, Hyper Roll, Double Up, Tocker’s Trials), and only acts on the queues you allow. ARAM gets bench-swapping and trades; Rift gets full pick/ban.',
  },
  {
    q: 'Is it Windows only?',
    a: 'Today, yes, queuePop ships as a Windows installer and a portable build. It runs locally and minimizes to the system tray.',
  },
  {
    q: 'How do updates work?',
    a: 'Both the installer and portable builds check for new releases on launch. When one is available you get a one-click Update banner; the installer updates silently, the portable build swaps its own executable.',
  },
  {
    q: 'Can I see the code?',
    a: 'Absolutely, it is fully open source on GitHub. Read it, audit it, build it from source, or open an issue.',
  },
] as const

export const DISCLAIMER =
  'queuePop is an unofficial, fan-made tool. It is not endorsed by, affiliated with, or sponsored by Riot Games. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.'

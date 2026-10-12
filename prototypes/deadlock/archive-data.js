// Static design-study fixtures. Names and artwork are game assets; plans and reports are illustrative.
const ledgerItems = {
  'close-quarters': { name:'Close Quarters', type:'weapon', purpose:'Commit at close range.', why:'An aggressive choice for a plan built around holding a nearby target. Stay close enough to follow through; don’t cross the whole street for a bad chase.' },
  'extra-health': { name:'Extra Health', type:'vitality', purpose:'Give yourself room to recover.', why:'A simple durability choice for the opening lane. The goal is to stay present long enough to collect the next wave, not to trade your entire health bar for a risky elimination.' },
  'sprint-boots': { name:'Sprint Boots', type:'vitality', purpose:'Get where you are needed.', why:'Movement is part of the plan. Arriving with your team is more valuable than arriving late with an inventory full of damage.' },
  'spirit-strike': { name:'Spirit Strike', type:'spirit', purpose:'Support a close-range opening.', why:'An illustrative option for a build that wants to get close and create pressure. Read the current in-game effect before deciding whether it fits your approach.' },
  'bullet-lifesteal': { name:'Bullet Lifesteal', type:'vitality', purpose:'Stay in a sustained exchange.', why:'A sustain choice for a weapon-focused plan. It works best when you have the space to keep fighting, rather than being forced immediately into cover.' },
  'bullet-armor': { name:'Bullet Armor', type:'vitality', purpose:'Answer weapon pressure.', why:'Choose protection for the damage that is actually forcing you out. If spirit pressure is the bigger problem, reconsider this purchase instead of following a fixed list.' },
  'spirit-armor': { name:'Spirit Armor', type:'vitality', purpose:'Answer spirit pressure.', why:'A defensive alternative when spirit damage is shaping the fight. Use the match in front of you to decide which resistance deserves the investment.' },
  'enduring-speed': { name:'Enduring Speed', type:'vitality', purpose:'Keep moving with your team.', why:'A mobility direction for longer rotations and repeated fights. Treat this as an adaptation choice rather than an instruction to buy every illustrated item in order.' },
  'healbane': { name:'Healbane', type:'spirit', purpose:'Account for enemy recovery.', why:'An illustrative anti-healing choice when recovery keeps undoing your team’s progress. Check the current item rules and coordinate with teammates before purchasing.' },
  'healing-booster': { name:'Healing Booster', type:'vitality', purpose:'Invest in a sustain plan.', why:'A sample support choice when keeping an ally in the fight is the priority. Consider whether your team needs more recovery or a safer way to disengage.' },
  'healing-rite': { name:'Healing Rite', type:'vitality', purpose:'Find a moment to reset.', why:'An opening support option that rewards taking a safe recovery window. Reposition first; a restorative tool is not a reason to ignore incoming pressure.' },
  'rescue-beam': { name:'Rescue Beam', type:'spirit', purpose:'Give an ally a way out.', why:'A team-focused option for a support loadout. Watch where your ally will land and coordinate the rescue rather than turning it into a surprise.' }
};

const buildPlans = {
  balanced: {
    name:'Streetwise', hero:'warden', style:'Balanced pressure', line:'Hold the street. Pick your moment.',
    intro:'A steady opening, a decisive middle, and enough staying power to see the night through.',
    tip:'A purchase is a response to the match. If the next fight needs protection, let the damage wait.',
    stages:[
      {name:'Opening', cue:'Find your footing', note:'Build a reliable lane before looking for a fight. Farm, recover, and leave yourself a route back.', items:['close-quarters','extra-health','sprint-boots']},
      {name:'Pressure', cue:'Make the opening count', note:'Follow a teammate’s pressure. Add the tools that let you stay close without getting stranded.', items:['spirit-strike','bullet-lifesteal','bullet-armor']},
      {name:'Closing', cue:'Finish as a team', note:'Read the next objective fight. Mobility, protection, or anti-healing may matter more than another damage purchase.', items:['enduring-speed','spirit-armor','healbane']}
    ]
  },
  survival: {
    name:'Hold the line', hero:'warden', style:'Durability & control', line:'Be the reason your team can stay.',
    intro:'A patient Warden plan that puts presence, recovery, and protecting space ahead of the chase.',
    tip:'Being hard to remove helps only if you are somewhere useful. Fight where your team can follow.',
    stages:[
      {name:'Opening', cue:'Stay in the lane', note:'Protect your first few waves. Keep enough health to hold your position and avoid an unnecessary retreat.',items:['extra-health','healing-rite','sprint-boots']},
      {name:'Pressure', cue:'Answer their damage', note:'Use the enemy team’s pressure to choose your protection. These are options, not a mandatory shopping list.',items:['bullet-armor','spirit-armor','healing-booster']},
      {name:'Closing', cue:'Make room for everyone', note:'Stay with your team, contest useful space, and adapt your final choices to the next engagement.',items:['enduring-speed','bullet-lifesteal','healbane']}
    ]
  },
  support: {
    name:'No one left behind', hero:'ivy', style:'Team support', line:'A good escape is a shared one.',
    intro:'A companionable Ivy plan built around safe rotations, recovery, and getting your people home.',
    tip:'Keep one eye on your allies. The most useful item is often the one you use at the right moment.',
    stages:[
      {name:'Opening',cue:'Look after your lane',note:'Build a safe start with your lane partner. Recover between exchanges rather than forcing another trade.',items:['healing-rite','extra-health','sprint-boots']},
      {name:'Pressure',cue:'Move with your people',note:'Make your rotations deliberate. Keep your support tools available for the ally who needs them.',items:['healing-booster','rescue-beam','spirit-armor']},
      {name:'Closing',cue:'Bring everyone home',note:'Prepare for a longer team fight. Position so you can contribute without becoming the first casualty.',items:['enduring-speed','bullet-armor','healbane']}
    ]
  }
};

const records = [
  {id:'028', result:'Victory', hero:'Warden', heroId:'warden', score:'18 / 7 / 9', time:'32:18', when:'Last encounter', build:'balanced', souls:'42.3k', damage:'28.4k', title:'A night well won.', line:'The opening mattered. The follow-through won it.', takeaway:'Your team converted a late pick into an objective instead of scattering for another chase. Stay together when the map opens up.', next:'Bring that same patience to the first rotation. You don’t need to win the lane twice before helping the next one.', lead:[0,-2,1,3,2,7,12], timeline:[['08:10','Found your footing','A safe reset kept the lane from slipping away.'],['19:42','Turned the corner','A coordinated rotation created space for your team.'],['30:56','Closed the case','One pick became an objective and a clean finish.']]},
  {id:'027', result:'Defeat', hero:'Ivy', heroId:'ivy', score:'6 / 8 / 21', time:'38:42', when:'Earlier tonight', build:'support', souls:'36.8k', damage:'19.6k', title:'Not every night is yours.', line:'Good support. One rotation too far.', takeaway:'The final engagement started before everyone had arrived. Your recovery tools bought time, but the team never found a shared angle.', next:'Call for a regroup before the next objective. Arriving together is a stronger opening than asking everyone to catch up.', lead:[0,2,1,4,-1,-6,-10], timeline:[['09:26','Kept the lane alive','A recovery window gave your partner another wave.'],['22:18','Found a way out','A timely retreat stopped one lost fight from becoming two.'],['36:40','Lost the meeting point','A scattered rotation left the objective exposed.']]},
  {id:'026', result:'Victory', hero:'Warden', heroId:'warden', score:'12 / 5 / 14', time:'29:06', when:'Earlier tonight', build:'survival', souls:'39.1k', damage:'24.7k', title:'You held the line.', line:'A little patience. A lot of useful space.', takeaway:'You stayed near your allies through the closing fights. The enemy had to deal with your presence while your team worked around you.', next:'Keep adapting your protection to what is actually hurting you. A familiar build is a starting point, not a promise.', lead:[0,-1,2,2,6,9,14], timeline:[['07:35','Settled in','A patient opening kept your economy steady.'],['17:52','Held the crossing','Your team had time to reposition behind you.'],['27:44','Made it count','A sustained push turned the advantage into a finish.']]}
];

import {champions} from './arena-data.js?v=comp-flow-3';
import {ArenaModel} from './arena-model.mjs?v=comp-flow-3';

// These are teaching boards within the curated roster, not ranked meta recommendations.
export const comps = [
  {id:0,name:'Jinx Rebel Capstone',carry:'jinx',style:'Fast 8',traits:['Rebel','Ambusher','Sentinel'],difficulty:'Advanced',
   descriptor:'Protect a late-game carry behind a flexible frontline.',
   when:'Try this transition when your frontline is already stable and you find Jinx. Do not sell a strong upgraded carry just to chase a five-cost unit.',
   plan:'Keep Tristana holding your physical-damage items while you build a frontline. The transition adds Ekko and a second backline threat; Jinx is the optional capstone once you find her.',
   positioning:'Keep Jinx in the back row. Place your tanks across the front and Ekko one row behind them, away from concentrated enemy damage.',
   pivot:'If Jinx does not appear, keep your upgraded Tristana. Move the carry items only after the replacement is ready. A complete board matters more than the pictured capstone.',
   items:[{holder:'jinx',ids:['ie','rageblade'],note:'A physical-damage and attack-speed example. Tristana can hold this pair during the transition.'},{holder:'leona',ids:['warmog'],note:'Give your main frontline unit the health item. An upgraded Rell can hold it instead.'}],
   phases:[
     {label:'Opener',level:7,note:'Four-unit starting shape. Practice board spacing; the sandbox starts at level 7.',units:[[1,'irelia'],[4,'sett'],[22,'tristana',['ie','rageblade']],[26,'vex']]},
     {label:'Transition',level:7,note:'Add frontline before replacing your carry. Keep this board if Jinx is missing.',units:[[0,'irelia'],[2,'leona',['warmog']],[5,'rell'],[12,'ekko'],[22,'tristana',['ie','rageblade']],[26,'vex']]},
     {label:'Capstone',level:8,note:'An eight-unit positioning exercise. These units fit the sample roster; this is not a tournament build.',units:[[0,'irelia'],[2,'leona',['warmog']],[4,'sett'],[6,'rell'],[12,'ekko'],[22,'jinx',['ie','rageblade']],[24,'ziggs'],[26,'vex']]}
   ]},
  {id:1,name:'Zeri Firelight Backline',carry:'zeri',style:'Flex',traits:['Firelight','Sentinel','Scrap'],difficulty:'Intermediate',
   descriptor:'Build around ranged damage and a durable front row.',
   when:'Use this practice line when you have Zeri and an attack-speed item. Focus on protecting the backline while comparing frontline positions.',
   plan:'Begin with the strongest upgraded tanks you own. Add Ekko as a second threat when available. Spend on levels only after the current board can hold its position; rolling and income are simplified in this sandbox.',
   positioning:'Place Zeri in the back row and move her across the board when scouting suggests a safer side. Keep Ekko behind the main tank so he is not the first target.',
   pivot:'If Tristana is your stronger upgraded carry, keep her and move the physical items there. Keep defensive items on a tank instead of forcing a trait label.',
   items:[{holder:'zeri',ids:['rageblade','ie'],note:'Attack-speed and physical-damage practice items. Tristana is the alternative holder.'},{holder:'rell',ids:['warmog'],note:'Rell holds the defensive item; Leona is an alternative.'}],
   phases:[
     {label:'Opener',level:7,note:'A four-unit setup for learning carry protection.',units:[[1,'irelia'],[4,'rell',['warmog']],[22,'zeri',['rageblade','ie']],[26,'vex']]},
     {label:'Transition',level:7,note:'Add a sturdier front row and a second damage source.',units:[[0,'irelia'],[2,'leona'],[5,'rell',['warmog']],[12,'ekko'],[22,'zeri',['rageblade','ie']],[26,'ziggs']]},
     {label:'Full board',level:7,note:'Seven units. Experiment with the two backline positions and the flexible Vi slot.',units:[[0,'irelia'],[2,'leona'],[5,'rell',['warmog']],[8,'vi'],[12,'ekko'],[22,'zeri',['rageblade','ie']],[26,'ziggs']]}
   ]},
  {id:2,name:'Vex Visionary Practice',carry:'vex',style:'Standard',traits:['Visionary','Rebel','Sentinel'],difficulty:'Beginner',
   descriptor:'Learn mana item placement and frontline coverage.',
   when:'Start here to learn the board controls with Vex and Rell. This guide is a small positioning lesson, not a prescription to reroll a ranked lobby.',
   plan:'Keep Vex protected while adding frontline units. Add Nami as a separate spell damage source. In a real match, use natural upgrades and your health to decide when to level; the sandbox has no rounds or income.',
   positioning:'Keep Vex and Nami on different back-row hexes. Spread the tanks across the front so an exposed side does not lead straight to both casters.',
   pivot:'If your items favor physical damage, try the Zeri guide instead. Avoid moving a mana item onto an auto-attack carry simply to match a picture.',
   items:[{holder:'vex',ids:['shojin'],note:'Practice supplying mana to a caster. Nami can hold this item as an alternative.'},{holder:'rell',ids:['warmog'],note:'A defensive item keeps the frontline role clear. Leona can hold it instead.'}],
   phases:[
     {label:'Opener',level:7,note:'Four units, two item holders, one clear frontline.',units:[[1,'irelia'],[4,'rell',['warmog']],[22,'vex',['shojin']],[26,'ziggs']]},
     {label:'Transition',level:7,note:'Add Leona and Nami; spread your backline.',units:[[0,'irelia'],[3,'rell',['warmog']],[6,'leona'],[22,'vex',['shojin']],[24,'ziggs'],[26,'nami']]},
     {label:'Full board',level:7,note:'Seven-unit learning board. Reposition without changing the item holders.',units:[[0,'irelia'],[2,'sett'],[4,'rell',['warmog']],[6,'leona'],[22,'vex',['shojin']],[24,'ziggs'],[26,'nami']]}
   ]}
];
export function compSnapshot(id,phase=2){
  const comp=comps.find(c=>c.id===id),plan=comp?.phases[phase];
  if(!plan)throw new Error('Choose an available guide stage.');
  const model=new ArenaModel(champions);
  model.board.fill(null);model.bench.fill(null);model.nextId=1;model.level=plan.level;
  for(const [slot,id,items=[]] of plan.units){const unit=model.unit(id);unit.items=[...items];model.board[slot]=unit;}
  return model.snapshot();
}

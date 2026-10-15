// A deterministic, local planning sandbox. No combat or live-game connection.
export class ArenaModel {
  constructor(champions, random = Math.random) {
    this.pool = champions;
    this.random = random;
    this.reset();
  }
  reset() {
    this.gold = 50; this.level = 7; this.xp = 0; this.locked = false; this.nextId = 1;
    this.board = Array(28).fill(null); this.bench = Array(9).fill(null);
    this.stash = ['shojin', 'ie', 'warmog', 'rageblade'];
    [[1,'irelia'],[3,'sett'],[5,'rell'],[7,'vi'],[19,'ekko'],[22,'jinx'],[25,'vex']].forEach(([i,id]) => this.board[i] = this.unit(id));
    this.board[22].items = ['ie','rageblade']; this.board[1].items = ['warmog'];
    this.bench[1] = this.unit('zeri'); this.bench[4] = this.unit('tristana');
    this.shop = ['jinx','leona','nami','ziggs','irelia'];
  }
  unit(champion) { return {uid:this.nextId++, champion, stars:1, items:[]}; }
  champion(id) { return this.pool.find(c => c.id === id); }
  owned() { return [...this.board, ...this.bench].filter(Boolean); }
  find(uid) { for (const zone of ['board','bench']) { const index = this[zone].findIndex(u => u?.uid === uid); if(index >= 0) return {zone,index,unit:this[zone][index]}; } return null; }
  occupied() { return this.board.filter(Boolean).length; }
  ok(message) { return {ok:true,message}; }
  fail(message) { return {ok:false,message}; }
  buy(index, destination = null) {
    const id = this.shop[index]; if(!id) return this.fail('That shop slot is empty.');
    const c = this.champion(id); if(this.gold < c.cost) return this.fail(`You need ${c.cost} gold for ${c.name}.`);
    let zone = 'bench', slot = this.bench.indexOf(null);
    const pair = this.owned().filter(u => u.champion === id && u.stars === 1);
    if(destination) {
      zone = destination.zone; slot = destination.index;
      if(!['board','bench'].includes(zone) || !Number.isInteger(slot) || slot < 0 || slot >= this[zone].length) return this.fail('Drop onto a board or bench slot.');
      if(this[zone][slot]) return this.fail('Drop a shop champion onto an empty slot.');
      if(zone === 'board' && this.occupied() >= this.level) return this.fail(`Your board is full at level ${this.level}. Drop onto the bench instead.`);
    } else if(slot < 0 && pair.length < 2) return this.fail('Bench full. Move or sell a champion first.');
    this.gold -= c.cost; this.shop[index] = null;
    if(slot >= 0) this[zone][slot] = this.unit(id);
    else { // Complete a pair without requiring a spare bench slot.
      const target = pair[0]; target.stars = 2;
      this.absorb(target, pair[1]);
    }
    const merged = this.combine(id);
    return this.ok(`${c.name} purchased${merged || slot < 0 ? ' · star upgrade!' : ' → '+zone}`);
  }
  snapshot() {
    return structuredClone({version:1,gold:this.gold,level:this.level,xp:this.xp,locked:this.locked,board:this.board,bench:this.bench,shop:this.shop,stash:this.stash});
  }
  restore(saved) {
    if(!saved || saved.version !== 1 || !Number.isSafeInteger(saved.gold) || saved.gold < 0 || ![7,8,9].includes(saved.level) || !Number.isInteger(saved.xp) || saved.xp < 0 || saved.xp >= (saved.level===7?36:saved.level===8?48:1) || typeof saved.locked !== 'boolean') return false;
    if(!Array.isArray(saved.board)||saved.board.length!==28||!Array.isArray(saved.bench)||saved.bench.length!==9||!Array.isArray(saved.shop)||saved.shop.length!==5||!Array.isArray(saved.stash)) return false;
    const validItem = id => ['ie','shojin','warmog','rageblade'].includes(id);
    const units = [...saved.board,...saved.bench].filter(u=>u!==null);
    if(units.some(u=>!u||!Number.isSafeInteger(u.uid)||u.uid<1||!this.champion(u.champion)||![1,2,3].includes(u.stars)||!Array.isArray(u.items)||u.items.length>3||!u.items.every(validItem)))return false;
    if(new Set(units.map(u=>u.uid)).size!==units.length || saved.board.filter(Boolean).length>saved.level || !saved.shop.every(id=>id===null||this.champion(id)) || !saved.stash.every(validItem))return false;
    const snapshot = structuredClone(saved);
    for(const key of ['gold','level','xp','locked','board','bench','shop','stash'])this[key]=snapshot[key];
    this.nextId = Math.max(0,...units.map(u=>u.uid))+1;
    return true;
  }
  absorb(target, other) {
    const source = this.find(other.uid); if(!source) return;
    source.unit.items.forEach(item => target.items.length < 3 ? target.items.push(item) : this.stash.push(item));
    this[source.zone][source.index] = null;
  }
  combine(id) {
    let upgraded = false;
    for(let stars = 1; stars < 3; stars++) {
      let matches = this.owned().filter(u => u.champion === id && u.stars === stars);
      while(matches.length >= 3) {
        const target = matches[0]; this.absorb(target,matches[1]); this.absorb(target,matches[2]); target.stars++;
        upgraded = true; matches = this.owned().filter(u => u.champion === id && u.stars === stars);
      }
    }
    return upgraded;
  }
  move(uid, zone, index) {
    const source = this.find(uid);
    if(!source || !['board','bench'].includes(zone) || !Number.isInteger(index) || index < 0 || index >= this[zone].length) return this.fail('Choose a board or bench slot.');
    if(source.zone === zone && source.index === index) return this.ok('Champion selected.');
    const target = this[zone][index];
    if(source.zone === 'bench' && zone === 'board' && !target && this.occupied() >= this.level) return this.fail(`Your board is full at level ${this.level}. Swap a unit or buy XP.`);
    // Swapping a bench occupant onto a full board would also exceed the unit cap.
    if(source.zone === 'board' && zone === 'bench' && !target) {
      this.board[source.index] = null; this.bench[index] = source.unit;
    } else {
      this[source.zone][source.index] = target; this[zone][index] = source.unit;
    }
    return this.ok(target ? 'Champions swapped.' : 'Position updated.');
  }
  reroll() {
    if(this.locked) return this.fail('Unlock the shop before rerolling.');
    if(this.gold < 2) return this.fail('Reroll costs 2 gold.');
    this.gold -= 2;
    this.shop = Array.from({length:5},() => this.pool[Math.min(this.pool.length-1,Math.floor(this.random()*this.pool.length))].id);
    return this.ok('Fresh shop.');
  }
  buyXP() {
    if(this.level >= 9) return this.fail('Maximum sandbox level reached.');
    if(this.gold < 4) return this.fail('Buy XP costs 4 gold.');
    this.gold -= 4; this.xp += 4;
    const needed = this.level === 7 ? 36 : 48;
    if(this.xp >= needed) {this.xp -= needed;this.level++;return this.ok(`Level ${this.level}! One more board slot.`);}
    return this.ok('+4 XP');
  }
  sell(uid) {
    const source = this.find(uid); if(!source) return this.fail('Select a champion to sell.');
    const value = this.champion(source.unit.champion).cost * 3 ** (source.unit.stars-1);
    this.gold += value; this.stash.push(...source.unit.items); this[source.zone][source.index] = null;
    return this.ok(`Sold for ${value} gold. Equipped items returned to the armory.`);
  }
  equip(stashIndex, uid) {
    const source = this.find(uid), item = this.stash[stashIndex];
    if(!source || !item) return this.fail('Choose an item and a champion.');
    if(source.unit.items.length >= 3) return this.fail('This champion already holds three items.');
    source.unit.items.push(item); this.stash.splice(stashIndex,1); return this.ok('Item equipped.');
  }
  unequip(uid) {
    const source = this.find(uid); if(!source) return this.fail('Select a champion first.');
    if(!source.unit.items.length) return this.fail('This champion has no items.');
    this.stash.push(...source.unit.items); source.unit.items = []; return this.ok('Items returned to the armory.');
  }
}

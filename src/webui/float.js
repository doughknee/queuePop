// The suggestions float (DONI-346): polls champ select once a second and shows the timer and the best picks for your role
// (the crawler's /lol/draft via draft-advice.js; the rule-based suggestions when the crawler can't answer).
(function () {
  const api = () => window.pywebview && window.pywebview.api;
  const $ = id => document.getElementById(id);
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const names = {};
  const name = id => names[id] || `Champion ${id}`;
  const icon = id => `assets/champions/${id}.png`;
  api()?.get_champion_catalog().then(list => { for (const c of list || []) names[c.id] = c.name; }).catch(() => {});

  const row = (n, id, title, why, low) => `<li class="${low ? 'low' : ''}"><span class="n">${n}</span><img src="${icon(id)}" alt="" onerror="this.style.visibility='hidden'"><span><b>${E(title)}</b><small>${E(why)}</small></span></li>`;
  async function tick() {
    const a = api(); if (!a) return;
    let cs; try { cs = await a.get_champ_select(); } catch { return; }
    if (!cs || !cs.active) { $('empty').hidden = false; $('list').innerHTML = ''; $('timer').textContent = ''; return; }
    $('empty').hidden = true;
    for (const p of [...(cs.myTeam || []), ...(cs.theirTeam || [])]) if (p.championId && p.name) names[p.championId] = p.name;
    $('phase').textContent = String(cs.phase || 'Champ select').replace(/_/g, ' ').toLowerCase();
    $('timer').textContent = cs.timer_left != null ? Math.ceil(cs.timer_left) : '';
    const ctx = draftAdvice.draftContext(cs);
    let html = '';
    if (ctx.role) {
      const r = await draftAdvice.fetch(ctx).catch(() => null);
      const rows = r ? draftAdvice.topCandidates(r, ctx, 5) : [];
      html = rows.map((c, i) => row(i + 1, c.champion, name(c.champion), draftAdvice.whyLine(c, name) || 'Not enough games yet', c.lowSample)).join('');
      $('title').textContent = `Best picks for you · ${ctx.role}`;
    }
    if (!html) { // no role (blind, ARAM) or no crawler: the rule-based suggestions from your own list
      const s = await a.pick_suggestions().catch(() => null);
      const items = s && s.ok ? (s.phase === 'bans' ? s.bans : s.picks) || [] : [];
      html = items.map((it, i) => row(i + 1, it.id, it.champ, (s.phase === 'bans' ? [it.reason] : it.reasons || []).join(' · '))).join('');
      $('title').textContent = s && s.phase === 'bans' ? 'Ban suggestions' : 'Suggestions from your list';
    }
    $('list').innerHTML = html || '<li><span><small>No suggestions yet. They appear once your role is known.</small></span></li>';
  }
  $('close').addEventListener('click', () => api()?.close_float());
  tick(); setInterval(tick, 1000);
})();

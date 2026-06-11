/* Per-champ loadout editor (spells + rune page + skin). Opened from a selected
   pick's gear. Edits plan[role].loadouts[champId] live (which is the canonical
   config object); empty loadouts are pruned on close. Disk shape:
     { spells:[id,id], rune:"off"|"recommended"|<pageId>,
       skin:"off"|<skinId>(pick one)|[skinId,…](random favorite) } */

let runePageList = []; // user's saved rune pages, loaded live for the editor
let loadoutRole = null; // role whose loadout is open in the editor
let loadoutChamp = 0; // championId whose loadout is open
let loSpellSlot = -1; // spell slot whose picker is open (-1 = none)
const skinCache = {}; // championId -> [{id,name,rarity,isBase}] (fetched once)

function curLoadout() {
  const los = plan[loadoutRole].loadouts || (plan[loadoutRole].loadouts = {});
  return (los[String(loadoutChamp)] ||= { spells: [], rune: "off", skin: "off" });
}

async function openLoadout(role, champId) {
  loadoutRole = role;
  loadoutChamp = Number(champId);
  loSpellSlot = -1;
  const lo = curLoadout();
  $("lo-name").textContent = idToName(loadoutChamp) || "";
  $("lo-role").textContent = (roles.find((r) => r.key === role) || {}).label || role;
  const icon = champIconById(loadoutChamp);
  $("lo-icon").src = icon || "";
  $("lo-icon").style.visibility = icon ? "" : "hidden";
  // Splash header = base-skin tile (championId * 1000); gracefully blank if absent.
  $("lo-hero-bg").style.backgroundImage = `url("assets/skins/tiles/${loadoutChamp * 1000}.jpg")`;

  renderSpellSlots(lo);
  $("lo-spell-pop").classList.add("hidden");
  buildLoadoutSkin(lo);
  $("loadout-modal").classList.remove("hidden");
  await buildLoadoutRunes(lo); // async (live client), fine to populate after show
}

function closeLoadout() {
  // Prune an empty loadout so the dot/indicator stays honest. A skin of 0 (Pick
  // mode, nothing chosen) or [] (empty favorites) counts as unset.
  const los = plan[loadoutRole]?.loadouts || {};
  const lo = los[String(loadoutChamp)];
  const skinOff =
    lo &&
    (lo.skin === "off" ||
      lo.skin === 0 ||
      (Array.isArray(lo.skin) && lo.skin.length === 0));
  if (lo && !(lo.spells || []).length && lo.rune === "off" && skinOff)
    delete los[String(loadoutChamp)];
  $("loadout-modal").classList.add("hidden");
  renderGrid($("champ-search").value); // refresh the loadout dot
  scheduleSave();
}

// --- Spells: two icon slots + an inline picker; the spell chosen in one slot
// is disabled in the other so you can't pick the same spell twice. ----------
function spellIcon(id) { return `assets/spells/${id}.png`; }

function renderSpellSlots(lo) {
  const spells = lo.spells || [];
  [0, 1].forEach((slot) => {
    const btn = $(`lo-spell-slot${slot}`);
    const id = spells[slot];
    btn.classList.toggle("active", loSpellSlot === slot);
    if (id) {
      btn.innerHTML =
        `<img src="${spellIcon(id)}" alt="${spellName(id)}" ` +
        `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'lo-slot-empty',textContent:'+'}))" />`;
      btn.title = spellName(id);
    } else {
      btn.innerHTML = `<span class="lo-slot-empty">+</span>`;
      btn.title = "Choose a summoner spell";
    }
  });
}

function openSpellPicker(slot, lo) {
  loSpellSlot = slot;
  const other = lo.spells?.[slot === 0 ? 1 : 0];
  const cur = lo.spells?.[slot];
  const pop = $("lo-spell-pop");
  pop.innerHTML =
    spellList
      .map((s) => {
        const dis = s.id === other ? " disabled" : "";
        const sel = s.id === cur ? " sel" : "";
        return (
          `<div class="lo-spell-opt${sel}${dis}" data-spell="${s.id}" title="${s.name}">` +
          `<img src="${spellIcon(s.id)}" alt="${s.name}" /></div>`
        );
      })
      .join("") +
    (cur != null
      ? `<button type="button" class="lo-spell-clear">Clear this slot</button>`
      : "");
  pop.classList.remove("hidden");
  renderSpellSlots(lo); // light up the active slot
}

function setSpell(slot, id) {
  const lo = curLoadout();
  const arr = [lo.spells?.[0] ?? 0, lo.spells?.[1] ?? 0];
  arr[slot] = id; // id 0 clears the slot
  lo.spells = arr.filter((x) => x > 0); // compact (slot1, slot2), order preserved
  loSpellSlot = -1;
  $("lo-spell-pop").classList.add("hidden");
  renderSpellSlots(lo);
  scheduleSave();
}

document.querySelectorAll(".lo-spell-slot").forEach((btn) =>
  btn.addEventListener("click", () => {
    const slot = Number(btn.dataset.slot);
    const lo = curLoadout();
    if (loSpellSlot === slot) {
      loSpellSlot = -1; // clicking the open slot again closes the picker
      $("lo-spell-pop").classList.add("hidden");
      renderSpellSlots(lo);
    } else {
      openSpellPicker(slot, lo);
    }
  }),
);
$("lo-spell-pop").addEventListener("click", (e) => {
  if (e.target.closest(".lo-spell-clear")) { setSpell(loSpellSlot, 0); return; }
  const opt = e.target.closest(".lo-spell-opt");
  if (!opt || opt.classList.contains("disabled")) return;
  setSpell(loSpellSlot, Number(opt.dataset.spell));
});

// --- Runes: an enable toggle gates the page picker (off ⇒ rune:"off"). -------
async function buildLoadoutRunes(lo) {
  const on = lo.rune !== "off";
  $("lo-rune-on").checked = on;
  $("lo-rune-body").classList.toggle("hidden", !on);
  const sel = $("lo-rune");
  const hint = $("lo-rune-hint");
  try { runePageList = (await api().get_rune_pages()) || []; } catch (_) { runePageList = []; }
  let opts = '<option value="recommended">Client\'s recommended page</option>';
  for (const p of runePageList) opts += `<option value="${p.id}">${p.name}</option>`;
  // Preserve a saved page id even if the client is closed (page not listed).
  if (typeof lo.rune === "number" && !runePageList.some((p) => p.id === lo.rune))
    opts += `<option value="${lo.rune}">Saved page #${lo.rune}</option>`;
  sel.innerHTML = opts;
  sel.value = lo.rune === "off" ? "recommended" : String(lo.rune);
  hint.textContent = runePageList.length
    ? ""
    : "Open the League client to load your saved rune pages.";
  sel.onchange = () => {
    const v = sel.value;
    lo.rune = v === "recommended" ? v : Number(v);
    scheduleSave();
  };
}

$("lo-rune-on").addEventListener("change", () => {
  const lo = curLoadout();
  if ($("lo-rune-on").checked) {
    if (lo.rune === "off") lo.rune = "recommended";
    $("lo-rune-body").classList.remove("hidden");
    $("lo-rune").value = lo.rune === "recommended" ? "recommended" : String(lo.rune);
  } else {
    lo.rune = "off";
    $("lo-rune-body").classList.add("hidden");
  }
  scheduleSave();
});

// --- Skins: an enable toggle + two modes -----------------------------------
//   "Pick a skin"     → lo.skin is a single skin id; choosing one dims the rest.
//   "Random favorite" → lo.skin is an array of ids; queuePop picks one at random
//                       (from the ones you own) when the champ locks in.
// 0 / [] means "enabled but nothing chosen yet" (pruned to "off" on save).
function skinMode(lo) {
  if (Array.isArray(lo.skin)) return "favorite";
  if (typeof lo.skin === "number") return "pick";
  return ""; // "off"
}

function markSkinMode(lo) {
  const m = skinMode(lo);
  document.querySelectorAll("#lo-skin-modes .lo-mode").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === m),
  );
  const hint = $("lo-skin-hint");
  if (hint)
    hint.textContent =
      m === "favorite"
        ? "Pick any number, queuePop randomly chooses one of these each game."
        : m === "pick"
          ? "queuePop sets this exact skin (if you own it)."
          : "";
}

function buildLoadoutSkin(lo) {
  const on = lo.skin !== "off";
  $("lo-skin-on").checked = on;
  $("lo-skin-body").classList.toggle("hidden", !on);
  markSkinMode(lo);
  if (on) renderSkinGrid(lo);
  else $("lo-skin-grid").classList.add("hidden");
}

$("lo-skin-on").addEventListener("change", () => {
  const lo = curLoadout();
  if ($("lo-skin-on").checked) {
    if (lo.skin === "off") lo.skin = 0; // default: Pick a skin, awaiting choice
    $("lo-skin-body").classList.remove("hidden");
    markSkinMode(lo);
    renderSkinGrid(lo);
  } else {
    lo.skin = "off";
    $("lo-skin-body").classList.add("hidden");
  }
  scheduleSave();
});

$("lo-skin-modes").addEventListener("click", (e) => {
  const btn = e.target.closest(".lo-mode");
  if (!btn) return;
  const lo = curLoadout();
  const mode = btn.dataset.mode;
  if (mode === "pick" && skinMode(lo) !== "pick") {
    // From favorite → pick: keep the first favorite as the chosen skin, if any.
    lo.skin = Array.isArray(lo.skin) && lo.skin.length ? lo.skin[0] : 0;
  } else if (mode === "favorite" && skinMode(lo) !== "favorite") {
    // From pick → favorite: seed the list with the current pick, if any.
    lo.skin = typeof lo.skin === "number" && lo.skin > 0 ? [lo.skin] : [];
  }
  markSkinMode(lo);
  renderSkinGrid(lo);
  scheduleSave();
});

// Fetch a champion's skins once, then reuse, clicks just retag the selection
// so the grid never re-fetches or flickers.
async function loadSkins(champId) {
  if (skinCache[champId]) return skinCache[champId];
  let skins = [];
  try { skins = (await api().get_champion_skins(champId)) || []; } catch (_) {}
  skinCache[champId] = skins;
  return skins;
}

function skinSelected(lo, id) {
  return Array.isArray(lo.skin) ? lo.skin.includes(id) : id === lo.skin;
}

async function renderSkinGrid(lo) {
  const grid = $("lo-skin-grid");
  grid.classList.remove("hidden");
  const champ = loadoutChamp;
  let skins = skinCache[champ];
  if (!skins) {
    grid.innerHTML = `<p class="skin-empty">Loading skins…</p>`;
    skins = await loadSkins(champ);
    if (champ !== loadoutChamp) return; // a different loadout opened mid-fetch
  }
  if (!skins.length) {
    grid.innerHTML =
      `<p class="skin-empty">No skin data bundled. Run ` +
      `<code>python scripts/fetch_assets.py</code>.</p>`;
    return;
  }
  // In Pick mode, once a skin is chosen the others dim.
  const hasPick = skinMode(lo) === "pick" && typeof lo.skin === "number" && lo.skin > 0;
  grid.innerHTML = skins
    .map((s) => {
      const sel = skinSelected(lo, s.id);
      const dim = hasPick && !sel ? " dim" : "";
      return (
        `<div class="lo-skin-cell${sel ? " on" : ""}${dim}" data-sid="${s.id}" title="${s.name}">` +
          `<img src="assets/skins/tiles/${s.id}.jpg" onerror="this.style.visibility='hidden'" />` +
          `<span class="lo-skin-name">${s.name}</span>` +
        `</div>`
      );
    })
    .join("");
}

$("lo-skin-grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".lo-skin-cell");
  if (!cell) return;
  const lo = curLoadout();
  const id = Number(cell.dataset.sid);
  const grid = $("lo-skin-grid");
  if (skinMode(lo) === "favorite") {
    // Multi-select: toggle this skin in/out of the favorites list (in place).
    const arr = Array.isArray(lo.skin) ? lo.skin.slice() : [];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    lo.skin = arr;
    cell.classList.toggle("on", arr.includes(id));
  } else {
    // Single-select: choose this skin, dim the rest (in place, no re-fetch).
    lo.skin = id;
    grid.querySelectorAll(".lo-skin-cell").forEach((c) => {
      const on = Number(c.dataset.sid) === id;
      c.classList.toggle("on", on);
      c.classList.toggle("dim", !on);
    });
  }
  markSkinMode(lo); // refresh the hint
  scheduleSave();
});

$("lo-done").addEventListener("click", closeLoadout);
document.querySelectorAll("#loadout-modal [data-lo-close]").forEach((el) =>
  el.addEventListener("click", closeLoadout),
);

QP._loaded.push("pages/loadout");

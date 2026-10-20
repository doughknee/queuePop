// Discord webhook + desktop toast alerts. Port of src/notifications.py.
const https = require("https");

const GOLD = 0xc8aa6e;
const KINDS = {
  queue_pop: ["⚡ Queue Popped", GOLD],
  champ_select: ["⚔️ Champ select started", 0x3498db],
  locked_pick: ["🔒 Pick locked", 0x2ecc71],
  game_start: ["🎮 Game starting", 0x9b59b6],
  game_end: ["🏁 Game over", 0x95a5a6],
  disconnect: ["🔌 Client disconnected", 0xe74c3c],
  test: ["✅ queuePop test", GOLD],
};
const DDRAGON = "https://ddragon.leagueoflegends.com";
const dd = { version: null, byId: {}, byName: {} };

// A Discord webhook address (discord.com, discordapp.com, canary./ptb.), so alerts never post anywhere else (DONI-534).
const WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
const isWebhook = (url) => WEBHOOK.test(String(url || "").trim());
const NOT_WEBHOOK = "That isn't a Discord webhook address (https://discord.com/api/webhooks/…)";

// Webhook JSON: the @mention alone in `content` (so the phone push fires) plus one embed.
function buildDiscordPayload(kind, text, { queue, champion, championId, mention } = {}) {
  const content = mention ? `<@${mention}>` : "";
  if (!(kind in KINDS)) return { content: `${content} ${text}`.trim() };
  const [title, color] = KINDS[kind];
  const embed = { title, description: text, color, footer: { text: "queuePop • auto-accepting" } };
  const fields = [];
  if (queue) fields.push({ name: "Queue", value: queue, inline: true });
  if (champion) fields.push({ name: "Champion", value: champion, inline: true });
  if (fields.length) embed.fields = fields;
  const alias = dd.byId[championId] || dd.byName[(champion || "").toLowerCase()];
  if (alias) embed.thumbnail = { url: `${DDRAGON}/cdn/${dd.version}/img/champion/${alias}.png` };
  return { content, embeds: [embed] };
}

function request(url, { method = "GET", body, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(url, {
      method, timeout, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// A failure only means no thumbnail; the alert still goes out.
async function loadDdragon() {
  if (dd.version) return;
  try {
    const version = JSON.parse((await request(`${DDRAGON}/api/versions.json`)).text)[0];
    const data = Object.values(JSON.parse((await request(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`)).text).data);
    dd.byId = Object.fromEntries(data.map((c) => [Number(c.key), c.id]));
    dd.byName = Object.fromEntries(data.map((c) => [c.name.toLowerCase(), c.id]));
    dd.version = version;
  } catch {}
}

// ctx: { getConfig, push, log, icon, Notification } — Notification is injected so tests need no Electron.
function createNotifier(ctx) {
  const lastSent = {};
  const mark = (channel, what) => { lastSent[channel] = { ts: Date.now() / 1000, what }; };
  const fail = (channel, what, err) => {
    lastSent[channel] = { ts: Date.now() / 1000, what, error: String(err) };
    ctx.push(`${channel[0].toUpperCase() + channel.slice(1)} alert failed: ${err}`, "warning");
  };

  function desktop(title, message, what = "alert") {
    try {
      if (!ctx.Notification.isSupported()) throw new Error("notifications unsupported");
      new ctx.Notification({ title, body: message, icon: ctx.icon, timeoutType: "default" }).show();
      mark("desktop", what);
      return true;
    } catch (e) { fail("desktop", what, e); return false; }
  }

  async function post(url, kind, text, opts, verbose) {
    if (opts.champion || opts.championId) await loadDdragon();
    const r = await request(url, { method: "POST", body: buildDiscordPayload(kind, text, opts) });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`Discord returned ${r.status}${verbose && r.text ? ": " + r.text.slice(0, 200) : ""}`);
    }
  }

  async function discord(kind, text, opts = {}, what = "alert") {
    const cfg = ctx.getConfig();
    if (!cfg.webhook_url) return;
    if (!isWebhook(cfg.webhook_url)) return fail("discord", what, NOT_WEBHOOK);
    try { await post(cfg.webhook_url, kind, text, { mention: cfg.user_id, ...opts }); mark("discord", what); }
    catch (e) { fail("discord", what, e); }
  }

  // -> {ok, error}
  async function testDiscord(url, userId) {
    if (!url) return { ok: false, error: "No webhook URL configured." };
    if (!isWebhook(url)) return { ok: false, error: NOT_WEBHOOK };
    try {
      await post(url, "test", "Your Discord webhook is working. You'll get a ping like this when your queue pops.", { mention: userId }, true);
      mark("discord", "Test message");
      return { ok: true, error: null };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  // Fan an event to the enabled + subscribed channels. Queue pop defaults on, the rest off.
  // opts.test skips the per-event filter (Settings' "Test a queue pop" sends through every channel that is on).
  async function alert(key, title, body, what, opts = {}) {
    const cfg = ctx.getConfig();
    if (!opts.test && !((cfg.alert_events || {})[key] ?? key === "queue_pop")) return;
    if (cfg.desktop_notifications) desktop(title, body, what);
    if (cfg.discord_enabled ?? true) await discord(key, body, opts, what);
  }

  return { lastSent, desktop, discord, testDiscord, alert };
}

module.exports = { buildDiscordPayload, createNotifier, isWebhook };

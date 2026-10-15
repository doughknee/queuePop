// League Client (LCU) connection: lockfile discovery, HTTPS REST, WAMP websocket.
// Port of src/lcu.py's transport. Emits 'connect', 'disconnect', and 'event' ({uri, eventType, data}).
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFile } = require("child_process");
const { EventEmitter } = require("events");
const WebSocket = require("ws");

const DEFAULT_DIR = "C:\\Riot Games\\League of Legends";

// "LeagueClient:<pid>:<port>:<password>:<protocol>"
function parseLockfile(text) {
  const [name, pid, port, password, protocol] = text.trim().split(":");
  if (!password || !Number(port)) throw new Error("bad lockfile: " + text);
  return { name, pid: Number(pid), port: Number(port), password, protocol };
}

// Install dir of the running client, via its process path. Null when not running.
function clientDir() {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", "(Get-Process LeagueClientUx -ErrorAction SilentlyContinue | Select-Object -First 1).Path"],
      { windowsHide: true }, (err, out) => resolve(!err && out.trim() ? path.dirname(out.trim()) : null));
  });
}

class LCU extends EventEmitter {
  constructor() {
    super();
    this.creds = null;
    this.ws = null;
    this.dir = DEFAULT_DIR;
  }

  get connected() { return !!this.creds; }

  start() { this._poll(); }

  async _poll() {
    if (this.creds) return;
    // ponytail: the client recreates the lockfile on launch; we only shell out to PowerShell when the cached dir has none.
    let file = path.join(this.dir, "lockfile");
    if (!fs.existsSync(file)) {
      const dir = await clientDir();
      if (dir) { this.dir = dir; file = path.join(dir, "lockfile"); }
    }
    try {
      this.creds = parseLockfile(fs.readFileSync(file, "utf8"));
      this._openSocket();
    } catch {
      this.creds = null;
      setTimeout(() => this._poll(), 3000);
    }
  }

  _auth() { return "Basic " + Buffer.from("riot:" + this.creds.password).toString("base64"); }

  _openSocket() {
    const ws = new WebSocket(`wss://127.0.0.1:${this.creds.port}/`, "wamp",
      { headers: { Authorization: this._auth() }, rejectUnauthorized: false });
    this.ws = ws;
    ws.on("open", () => {
      ws.send(JSON.stringify([5, "OnJsonApiEvent"]));
      this.emit("connect");
    });
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg[0] === 8 && msg[2]) this.emit("event", msg[2]);
    });
    ws.on("error", () => {}); // 'close' follows and handles reconnect
    ws.on("close", () => {
      const was = this.ws === ws;
      this.ws = null;
      this.creds = null;
      if (was) this.emit("disconnect");
      setTimeout(() => this._poll(), 3000);
    });
  }

  // Resolves {status, data}; data is parsed JSON or null. Rejects when not connected.
  request(method, uri, body) {
    if (!this.creds) return Promise.reject(new Error("LCU not connected"));
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request({
        host: "127.0.0.1", port: this.creds.port, path: uri, method: method.toUpperCase(),
        rejectUnauthorized: false, timeout: 5000,
        headers: { Authorization: this._auth(), Accept: "application/json",
          ...(payload && { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }) },
      }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = text; }
          resolve({ status: res.statusCode, data });
        });
      });
      req.on("timeout", () => req.destroy(new Error("LCU request timed out")));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

module.exports = { LCU, parseLockfile };

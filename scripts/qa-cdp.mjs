/* Ad-hoc QA driver: connects to the dev app's WebView2 over CDP
   (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223),
   collects console errors, and evaluates the expressions passed on argv.
   Usage: node scripts/qa-cdp.mjs "<js expr>" ["<js expr>" ...]
   Each expr is awaited; results print as JSON. "SHOT:<path>" captures a
   screenshot instead. Not shipped — dev tooling only. */

const PORT = 9223;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && /index/.test(t.url));
if (!page) {
  console.error("no index.html page target; targets:", targets.map((t) => t.url));
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const consoleLines = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === "Runtime.consoleAPICalled") {
    const { type, args } = msg.params;
    if (type === "error" || type === "warning")
      consoleLines.push(`[${type}] ` + args.map((a) => a.value ?? a.description ?? "").join(" "));
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleLines.push("[exception] " + (msg.params.exceptionDetails?.text || "") + " " +
      (msg.params.exceptionDetails?.exception?.description || ""));
  }
};

await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send("Runtime.enable");
await send("Page.enable");

for (const expr of process.argv.slice(2)) {
  if (expr.startsWith("SHOT:")) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(expr.slice(5), Buffer.from(data, "base64"));
    console.log(JSON.stringify({ shot: expr.slice(5) }));
    continue;
  }
  if (expr.startsWith("WAIT:")) {
    await new Promise((r) => setTimeout(r, Number(expr.slice(5)) || 500));
    continue;
  }
  try {
    const r = await send("Runtime.evaluate", {
      expression: expr, awaitPromise: true, returnByValue: true,
    });
    console.log(JSON.stringify(
      r.exceptionDetails
        ? { expr, error: r.exceptionDetails.exception?.description || r.exceptionDetails.text }
        : { expr, value: r.result.value ?? r.result.description ?? null },
    ));
  } catch (err) {
    console.log(JSON.stringify({ expr, protoError: String(err) }));
  }
}

// Drain a beat so late console errors land, then report them.
await new Promise((r) => setTimeout(r, 700));
console.log("CONSOLE:" + JSON.stringify(consoleLines));
ws.close();

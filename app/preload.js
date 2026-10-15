// Emulates pywebview's window.pywebview.api: every bridge method is an async IPC call to main.
const { contextBridge, ipcRenderer } = require("electron");

const api = {};
// Sandboxed preloads cannot require local files, so main passes the method names as an argument.
const names = process.argv.find((a) => a.startsWith("--qp-methods=")).slice(13).split(",");
for (const name of names) api[name] = (...args) => ipcRenderer.invoke("api", name, args);
contextBridge.exposeInMainWorld("pywebview", { api });

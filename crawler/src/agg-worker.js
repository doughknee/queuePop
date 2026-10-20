// Runs one aggregation pass on its own SQLite connection, off the API's event loop (a full patch takes minutes).
// main.js starts it with workerData { dbPath }; it posts the number of patches rebuilt, or throws.
const { workerData, parentPort } = require("worker_threads");
const db = require("./db").open(workerData.dbPath);
parentPort.postMessage(require("./jobs").aggregate(db));
db.close();

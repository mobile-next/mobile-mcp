"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.trace = void 0;
const node_fs_1 = require("node:fs");
const writeLog = (message) => {
    if (process.env.LOG_FILE) {
        const logfile = process.env.LOG_FILE;
        const timestamp = new Date().toISOString();
        const levelStr = "INFO";
        const logMessage = `[${timestamp}] ${levelStr} ${message}`;
        (0, node_fs_1.appendFileSync)(logfile, logMessage + "\n");
    }
    console.error(message);
};
const trace = (message) => {
    writeLog(message);
};
exports.trace = trace;
const error = (message) => {
    writeLog(message);
};
exports.error = error;

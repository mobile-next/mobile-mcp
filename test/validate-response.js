"use strict";

const fs = require("node:fs");

const raw = fs.readFileSync(0, "utf8").trim();

console.log(raw);

const fenced = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
const json = fenced ? fenced[1].trim() : raw;

let response;
try {
	response = JSON.parse(json);
} catch (error) {
	console.error(`Response is not valid JSON: ${error.message}`);
	process.exit(1);
}

if (response.pass !== true) {
	console.error(`Test did not pass: ${response.error || "unknown reason"}`);
	process.exit(1);
}

if (!Array.isArray(response.steps)) {
	console.error("Response is missing a \"steps\" array");
	process.exit(1);
}

console.log("Response validated: pass=true, steps is an array");

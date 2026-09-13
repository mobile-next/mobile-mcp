"use strict";

const fs = require("node:fs");

// Returns the index of the "}" closing the object that opens at start, or -1.
// Braces inside JSON strings are ignored.
const findMatchingBrace = (text, start) => {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === "\\") {
				i++;
			} else if (ch === "\"") {
				inString = false;
			}

			continue;
		}

		if (ch === "\"") {
			inString = true;
		} else if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
	}

	return -1;
};

// Agents occasionally wrap the verdict in prose or a code fence despite being told
// to emit JSON only. Keep the last balanced {...} that parses.
const findLastJsonObject = text => {
	let found = null;
	for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
		const end = findMatchingBrace(text, start);
		if (end === -1) {
			continue;
		}

		try {
			found = JSON.parse(text.slice(start, end + 1));
			start = end;
		} catch {
			// not json, keep scanning
		}
	}

	return found;
};

const raw = fs.readFileSync(0, "utf8").trim();

console.log(raw);

const response = findLastJsonObject(raw);
if (response === null) {
	console.error("Response is not valid JSON: no parseable JSON object found");
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

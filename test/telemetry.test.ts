import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { createTelemetry, NoopTelemetry, PostHogTelemetry } from "../src/telemetry";

const HARDCODED_TOKEN_RE = /phc_[A-Za-z0-9_-]{20,}/;

/**
 * Recursively collects all files under `dir`, skipping node_modules and
 * files that cannot be read as UTF-8 text (treat them as binary).
 */
function collectTextFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules") {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectTextFiles(full));
		} else if (entry.isFile()) {
			results.push(full);
		}
	}
	return results;
}

/**
 * Returns all file paths that contain a hardcoded PostHog project token.
 * Scans the provided root paths (files or directories) recursively.
 * Binary files are skipped silently.
 */
function findHardcodedTokens(roots: string[]): string[] {
	const hits: string[] = [];
	for (const root of roots) {
		const stat = fs.statSync(root);
		const files = stat.isDirectory() ? collectTextFiles(root) : [root];
		for (const file of files) {
			let content: string;
			try {
				content = fs.readFileSync(file, "utf8");
			} catch {
				continue;
			}
			if (HARDCODED_TOKEN_RE.test(content)) {
				hits.push(file);
			}
		}
	}
	return hits;
}

describe("telemetry", () => {
	const originalEnv = process.env;
	const fetchCalls: string[] = [];
	let originalFetch: typeof globalThis.fetch;

	before(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url: string | URL | Request) => {
			fetchCalls.push(String(url));
			return new Response(null, { status: 200 });
		}) as typeof globalThis.fetch;
	});

	after(() => {
		globalThis.fetch = originalFetch;
	});

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.MOBILEMCP_TELEMETRY;
		delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		delete process.env.MOBILEMCP_POSTHOG_PROJECT_TOKEN;
		delete process.env.MOBILEMCP_POSTHOG_HOST;
		fetchCalls.length = 0;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("is disabled by default when no env vars are set", () => {
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry when no env vars set"
		);
	});

	it("MOBILEMCP_DISABLE_TELEMETRY set still returns NoopTelemetry (deprecated)", () => {
		process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry when MOBILEMCP_DISABLE_TELEMETRY is set"
		);
	});

	it("MOBILEMCP_TELEMETRY=1 without token returns NoopTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "1";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry when token is missing"
		);
	});

	it("MOBILEMCP_TELEMETRY=true without token returns NoopTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "true";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry when token is missing"
		);
	});

	it("MOBILEMCP_TELEMETRY=1 with token returns PostHogTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "1";
		process.env.MOBILEMCP_POSTHOG_PROJECT_TOKEN = "test-token";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof PostHogTelemetry,
			"Expected PostHogTelemetry when opted in with token"
		);
	});

	it("MOBILEMCP_TELEMETRY=true with token returns PostHogTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "true";
		process.env.MOBILEMCP_POSTHOG_PROJECT_TOKEN = "test-token";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof PostHogTelemetry,
			"Expected PostHogTelemetry when opted in with token"
		);
	});

	it("MOBILEMCP_TELEMETRY=0 returns NoopTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "0";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry for invalid opt-in value '0'"
		);
	});

	it("MOBILEMCP_TELEMETRY=false returns NoopTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "false";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry for invalid opt-in value 'false'"
		);
	});

	it("MOBILEMCP_TELEMETRY=no returns NoopTelemetry", () => {
		process.env.MOBILEMCP_TELEMETRY = "no";
		const telemetry = createTelemetry();
		assert.ok(
			telemetry instanceof NoopTelemetry,
			"Expected NoopTelemetry for invalid opt-in value 'no'"
		);
	});

	it("NoopTelemetry.capture does not call fetch", () => {
		const telemetry = new NoopTelemetry();
		telemetry.capture("test_event", { "Key": "value" });
		assert.strictEqual(
			fetchCalls.length,
			0,
			"NoopTelemetry must not call fetch"
		);
	});

	it("no hardcoded PostHog token exists in source", () => {
		const root = path.resolve(__dirname, "..");
		const hits = findHardcodedTokens([
			path.join(root, "src"),
			path.join(root, "test"),
			path.join(root, "package.json"),
		]);
		assert.deepStrictEqual(
			hits,
			[],
			`Hardcoded PostHog project token found in: ${hits.join(", ")}`
		);
	});
});

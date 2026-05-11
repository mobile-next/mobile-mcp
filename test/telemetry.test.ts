import assert from "node:assert";
import { createTelemetry, NoopTelemetry, PostHogTelemetry } from "../src/telemetry";

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
		const { execSync } = require("node:child_process");
		let found = false;
		try {
			execSync(
				"grep -rniE 'phc_[a-zA-Z0-9_-]{20,}' src test package.json 2>/dev/null",
				{ cwd: process.cwd() }
			);
			found = true;
		} catch {
			found = false;
		}
		assert.strictEqual(
			found,
			false,
			"A hardcoded PostHog project token was found in source. Remove it."
		);
	});
});

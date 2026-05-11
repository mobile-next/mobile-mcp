import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Telemetry {
	capture(event: string, properties?: Record<string, string | number>): void;
	shutdown(): Promise<void>;
}

export class NoopTelemetry implements Telemetry {
	capture(_event: string, _properties?: Record<string, string | number>): void {}
	async shutdown(): Promise<void> {}
}

/**
 * Returns a randomly generated v4 UUID that is persisted to disk so it
 * survives restarts.  The file lives in the platform's user-data directory
 * (~/.local/share on Linux, ~/Library/Application Support on macOS) under
 * "mobile-mcp/anonymous-id".  If the file cannot be read or written the
 * function falls back to a fresh in-memory UUID so telemetry is never blocked.
 */
function loadOrCreateAnonymousId(): string {
	const dataDir = path.join(os.homedir(), ...(
		process.platform === "darwin"
			? ["Library", "Application Support", "mobile-mcp"]
			: ["local", "share", "mobile-mcp"]
	));
	const idFile = path.join(dataDir, "anonymous-id");

	try {
		const existing = fs.readFileSync(idFile, "utf8").trim();
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
			return existing;
		}
	} catch {
		// file missing or unreadable — create a new one below
	}

	const id = crypto.randomUUID();
	try {
		fs.mkdirSync(dataDir, { recursive: true });
		fs.writeFileSync(idFile, id, { encoding: "utf8", mode: 0o600 });
	} catch {
		// if we cannot persist, use the in-memory UUID for this session
	}
	return id;
}

export class PostHogTelemetry implements Telemetry {
	private readonly token: string;
	private readonly host: string;
	private readonly distinctId: string;

	constructor(token: string, host: string) {
		this.token = token;
		this.host = host;
		this.distinctId = loadOrCreateAnonymousId();
	}

	capture(event: string, properties: Record<string, string | number> = {}): void {
		const systemProps: Record<string, string | number> = {
			"Platform": os.platform(),
			"Product": "mobile-mcp",
			"NodeVersion": process.version,
			"CI": process.env.CI || "0",
		};

		const body = JSON.stringify({
			"api_key": this.token,
			"event": event,
			"properties": {
				...systemProps,
				...properties,
			},
			"distinct_id": this.distinctId,
		});

		fetch(`${this.host}/i/v0/e/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body,
		}).catch(() => {});
	}

	async shutdown(): Promise<void> {}
}

export function createTelemetry(): Telemetry {
	if (process.env.MOBILEMCP_DISABLE_TELEMETRY) {
		console.warn(
			"MOBILEMCP_DISABLE_TELEMETRY is deprecated. Telemetry is now disabled by default."
		);
	}

	const enabled =
		process.env.MOBILEMCP_TELEMETRY === "1" ||
		process.env.MOBILEMCP_TELEMETRY === "true";

	if (!enabled) {
		return new NoopTelemetry();
	}

	const token = process.env.MOBILEMCP_POSTHOG_PROJECT_TOKEN;
	if (!token) {
		console.warn(
			"Mobile MCP telemetry was requested, but MOBILEMCP_POSTHOG_PROJECT_TOKEN is not set. Telemetry disabled."
		);
		return new NoopTelemetry();
	}

	const host =
		process.env.MOBILEMCP_POSTHOG_HOST ?? "https://us.i.posthog.com";
	return new PostHogTelemetry(token, host);
}

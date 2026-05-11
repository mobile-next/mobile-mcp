import os from "node:os";
import crypto from "node:crypto";

export interface Telemetry {
	capture(event: string, properties?: Record<string, string | number>): void;
	shutdown(): Promise<void>;
}

export class NoopTelemetry implements Telemetry {
	capture(_event: string, _properties?: Record<string, string | number>): void {}
	async shutdown(): Promise<void> {}
}

export class PostHogTelemetry implements Telemetry {
	private readonly token: string;
	private readonly host: string;
	private readonly distinctId: string;

	constructor(token: string, host: string) {
		this.token = token;
		this.host = host;
		const name = os.hostname() + process.execPath;
		this.distinctId = crypto.createHash("sha256").update(name).digest("hex");
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

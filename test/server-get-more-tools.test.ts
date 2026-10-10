import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

const listToolNamesWithTelemetry = async (isTelemetryEnabled: boolean): Promise<string[]> => {
	const previousTelemetrySetting = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	const previousFetch = globalThis.fetch;
	// never reach posthog from tests
	globalThis.fetch = async () => new Response();
	if (isTelemetryEnabled) {
		delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
	} else {
		process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	}

	try {
		const server = createMcpServer();
		const client = new Client({ name: "get-more-tools-test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		try {
			const result = await client.listTools();
			return result.tools.map(tool => tool.name);
		} finally {
			await client.close();
			await server.close();
		}
	} finally {
		globalThis.fetch = previousFetch;
		if (previousTelemetrySetting === undefined) {
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		} else {
			process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetrySetting;
		}
	}
};

test("get_more_tools is offered when telemetry is enabled", async () => {
	expect(await listToolNamesWithTelemetry(true)).toContain("get_more_tools");
});

test("get_more_tools is not registered at all when telemetry is disabled", async () => {
	expect(await listToolNamesWithTelemetry(false)).not.toContain("get_more_tools");
});

import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMcpServer } from "../src/server";

const discoverRequestBody = (id: string | number) =>
	JSON.stringify({
		jsonrpc: "2.0",
		id,
		method: "server/discover",
		params: {
			_meta: {
				"io.modelcontextprotocol/protocolVersion": "2026-07-28",
				"io.modelcontextprotocol/clientInfo": { name: "discover-test", version: "1.0.0" },
				"io.modelcontextprotocol/clientCapabilities": {},
			},
		},
	});

test("serves server/discover for the 2026-07-28 protocol revision", async () => {
	const previousTelemetrySetting = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

	try {
		// createMcpHandler is the serving entry production uses; it marks
		// each request's instance as serving the 2026-07-28 era, which is
		// what installs the server/discover handler. A hand-constructed
		// McpServer connected straight to a transport never serves
		// server/discover (the era gate answers -32601 instead).
		const handler = createMcpHandler(() => createMcpServer());

		const response = await handler.fetch(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json, text/event-stream",
					"MCP-Protocol-Version": "2026-07-28",
					"Mcp-Method": "server/discover",
				},
				body: discoverRequestBody("discover-1"),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.error).toBeUndefined();
		expect(body.result.supportedVersions).toContain("2026-07-28");
		expect(body.result.capabilities.tools).toBeDefined();
		expect(body.result.resultType).toBe("complete");
		expect(body.result._meta?.["io.modelcontextprotocol/serverInfo"]?.name).toBe("mobile-mcp");
	} finally {
		if (previousTelemetrySetting === undefined) {
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		} else {
			process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetrySetting;
		}
	}
});

test("still serves the legacy initialize handshake", async () => {
	const previousTelemetrySetting = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

	try {
		const server = createMcpServer();
		const client = new Client({ name: "legacy-test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);

			expect(client.getProtocolEra()).toBe("legacy");
			expect(client.getServerVersion()?.name).toBe("mobile-mcp");

			const tools = await client.listTools();
			expect(tools.tools.length).toBeGreaterThan(0);
		} finally {
			await client.close();
			await server.close();
		}
	} finally {
		if (previousTelemetrySetting === undefined) {
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		} else {
			process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetrySetting;
		}
	}
});

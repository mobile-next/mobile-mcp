import { expect, test } from "@playwright/test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMcpServer } from "../src/server";

process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

// createMcpHandler is the serving entry production uses; it marks each
// request's instance as serving the 2026-07-28 era, which is what installs
// the server/discover handler. A hand-constructed McpServer connected
// straight to a transport never serves server/discover (the era gate
// answers -32601 instead).
const handler = createMcpHandler(() => createMcpServer());

const postJsonRpc = async (body: object, extraHeaders: Record<string, string> = {}): Promise<Response> => {
	return handler.fetch(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json, text/event-stream",
				...extraHeaders,
			},
			body: JSON.stringify(body),
		}),
	);
};

// Legacy (2025-era) answers come back as a single SSE "message" event.
const readJsonRpcResult = async (response: Response): Promise<any> => {
	const text = await response.text();
	const dataLine = text.split("\n").find(line => line.startsWith("data: "));
	const payload = JSON.parse(dataLine ? dataLine.slice("data: ".length) : text);
	expect(payload.error).toBeUndefined();
	return payload.result;
};

test("serves server/discover for the 2026-07-28 protocol revision", async () => {
	const response = await postJsonRpc(
		{
			jsonrpc: "2.0",
			id: "discover-1",
			method: "server/discover",
			params: {
				_meta: {
					"io.modelcontextprotocol/protocolVersion": "2026-07-28",
					"io.modelcontextprotocol/clientInfo": { name: "discover-test", version: "1.0.0" },
					"io.modelcontextprotocol/clientCapabilities": {},
				},
			},
		},
		{
			"MCP-Protocol-Version": "2026-07-28",
			"Mcp-Method": "server/discover",
		},
	);

	expect(response.status).toBe(200);
	const result = await readJsonRpcResult(response);
	expect(result.supportedVersions).toContain("2026-07-28");
	expect(result.capabilities.tools).toBeDefined();
	expect(result.resultType).toBe("complete");
	expect(result._meta?.["io.modelcontextprotocol/serverInfo"]?.name).toBe("mobile-mcp");
});

test("still serves the legacy initialize handshake through the same handler", async () => {
	const response = await postJsonRpc({
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "legacy-test", version: "1.0.0" },
		},
	});

	expect(response.status).toBe(200);
	const result = await readJsonRpcResult(response);
	expect(result.protocolVersion).toBe("2025-11-25");
	expect(result.serverInfo.name).toBe("mobile-mcp");
});

test("still serves legacy tools/list statelessly", async () => {
	const response = await postJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });

	expect(response.status).toBe(200);
	const result = await readJsonRpcResult(response);
	expect(result.tools.length).toBeGreaterThan(0);
});

import { test, expect } from "@playwright/test";
import {
	createMcpHandler,
	InMemoryTransport,
	CLIENT_CAPABILITIES_META_KEY,
	CLIENT_INFO_META_KEY,
	PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import {
	createMcpServer,
	clientNameFromRequestMeta,
	protocolVersionFromRequestMeta,
} from "../src/server";

// telemetry is off by default in these tests; the one telemetry test enables it
// explicitly and stubs global fetch.
process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-06-18";

const modernEnvelope = (clientName: string = "mobile-mcp-tests") => ({
	[PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
	[CLIENT_INFO_META_KEY]: { name: clientName, version: "1.2.3" },
	[CLIENT_CAPABILITIES_META_KEY]: {},
});

interface HttpResponse {
	status: number;
	sessionId: string | null;
	body: any;
}

const newHandler = () => createMcpHandler(createMcpServer, { legacy: "stateless" });

const readBody = async (response: Response): Promise<any> => {
	const text = await response.text();
	if (response.headers.get("content-type")?.includes("text/event-stream")) {
		const line = text.split("\n").find(candidate => candidate.startsWith("data: "));
		return line ? JSON.parse(line.substring("data: ".length)) : undefined;
	}

	return text.length > 0 ? JSON.parse(text) : undefined;
};

const post = async (handler: ReturnType<typeof newHandler>, body: unknown, headers: Record<string, string> = {}): Promise<HttpResponse> => {
	const response = await handler.fetch(new Request("http://localhost/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"accept": "application/json, text/event-stream",
			...headers,
		},
		body: JSON.stringify(body),
	}));

	return {
		status: response.status,
		sessionId: response.headers.get("mcp-session-id"),
		body: await readBody(response),
	};
};

const modernRequest = (id: number, method: string, params: Record<string, unknown> = {}, clientName?: string) => ({
	jsonrpc: "2.0",
	id,
	method,
	params: { ...params, _meta: modernEnvelope(clientName) },
});

const modernHeaders = (method: string, name?: string): Record<string, string> => {
	const headers: Record<string, string> = {
		"MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
		"Mcp-Method": method,
	};

	if (name !== undefined) {
		headers["Mcp-Name"] = name;
	}

	return headers;
};

test.describe("mcp protocol 2026-07-28", () => {

	test.describe("discovery", () => {
		test("should answer server/discover with the modern revision and capabilities", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "server/discover"), modernHeaders("server/discover"));

				expect(response.status).toBe(200);
				expect(response.body.result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
				expect(response.body.result.capabilities.tools).toBeDefined();
				expect(response.body.result._meta["io.modelcontextprotocol/serverInfo"]).toEqual({
					name: "mobile-mcp",
					version: expect.any(String),
				});
			} finally {
				await handler.close();
			}
		});

		test("should return cacheable server/discover results", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "server/discover"), modernHeaders("server/discover"));

				expect(response.body.result.resultType).toBe("complete");
				expect(response.body.result.ttlMs).toBe(300_000);
				expect(response.body.result.cacheScope).toBe("public");
			} finally {
				await handler.close();
			}
		});
	});

	test.describe("modern requests", () => {
		test("should serve tools/list directly, without an initialize handshake", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "tools/list"), modernHeaders("tools/list"));

				expect(response.status).toBe(200);
				const toolNames = response.body.result.tools.map((tool: any) => tool.name);
				expect(toolNames).toContain("mobile_list_available_devices");
				expect(toolNames).toContain("mobile_take_screenshot");
			} finally {
				await handler.close();
			}
		});

		test("should mark list results as cacheable", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "tools/list"), modernHeaders("tools/list"));

				expect(response.body.result.resultType).toBe("complete");
				expect(response.body.result.ttlMs).toBe(300_000);
				expect(response.body.result.cacheScope).toBe("public");
			} finally {
				await handler.close();
			}
		});

		test("should reject initialize on the modern era", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "initialize"), modernHeaders("initialize"));

				expect(response.body.error.code).toBe(-32601);
			} finally {
				await handler.close();
			}
		});

		test("should be stateless — no session id is ever issued or required", async () => {
			const handler = newHandler();
			try {
				const first = await post(handler, modernRequest(1, "tools/list"), modernHeaders("tools/list"));
				const second = await post(handler, modernRequest(2, "server/discover"), modernHeaders("server/discover"));

				expect(first.sessionId).toBeNull();
				expect(second.sessionId).toBeNull();
				expect(first.body.result.tools.length).toBeGreaterThan(0);
				expect(second.body.result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
			} finally {
				await handler.close();
			}
		});

		test("should answer session operations with method not allowed", async () => {
			const handler = newHandler();
			try {
				const get = await handler.fetch(new Request("http://localhost/mcp", { method: "GET", headers: { accept: "text/event-stream" } }));
				const del = await handler.fetch(new Request("http://localhost/mcp", { method: "DELETE" }));

				expect(get.status).toBe(405);
				expect(del.status).toBe(405);
			} finally {
				await handler.close();
			}
		});
	});

	test.describe("http header rules", () => {
		test("should reject a modern request without the Mcp-Method header", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "tools/list"), {
					"MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
				});

				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe(-32020);
			} finally {
				await handler.close();
			}
		});

		test("should reject a tools/call whose Mcp-Name disagrees with the body", async () => {
			const handler = newHandler();
			try {
				const request = modernRequest(1, "tools/call", { name: "mobile_list_available_devices", arguments: {} });
				const response = await post(handler, request, modernHeaders("tools/call", "mobile_take_screenshot"));

				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe(-32020);
			} finally {
				await handler.close();
			}
		});

		test("should reject a protocol version header that disagrees with the envelope", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, modernRequest(1, "tools/list"), {
					"MCP-Protocol-Version": LEGACY_PROTOCOL_VERSION,
					"Mcp-Method": "tools/list",
				});

				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe(-32020);
			} finally {
				await handler.close();
			}
		});

		test("should reject a modern request that carries no _meta envelope", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, modernHeaders("tools/list"));

				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe(-32602);
			} finally {
				await handler.close();
			}
		});
	});

	test.describe("stdio transport", () => {
		test("should serve modern requests over stdio without an initialize handshake", async () => {
			const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
			const stdio = serveStdio(createMcpServer, { transport: serverTransport });

			try {
				const messages: any[] = [];
				clientTransport.onmessage = message => {
					messages.push(message);
				};

				await clientTransport.start();
				await clientTransport.send(modernRequest(1, "server/discover") as any);
				await expect.poll(() => messages.length, { timeout: 5000 }).toBe(1);

				expect(messages[0].result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
				expect(messages[0].result.resultType).toBe("complete");
			} finally {
				await stdio.close();
			}
		});

		test("should still serve the 2025-era handshake over stdio", async () => {
			const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
			const stdio = serveStdio(createMcpServer, { transport: serverTransport });

			try {
				const messages: any[] = [];
				clientTransport.onmessage = message => {
					messages.push(message);
				};

				await clientTransport.start();
				await clientTransport.send({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: LEGACY_PROTOCOL_VERSION,
						capabilities: {},
						clientInfo: { name: "legacy-client", version: "0.1.0" },
					},
				} as any);
				await expect.poll(() => messages.length, { timeout: 5000 }).toBe(1);

				expect(messages[0].result.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);
				expect(messages[0].result.resultType).toBeUndefined();
			} finally {
				await stdio.close();
			}
		});
	});

	test.describe("telemetry", () => {
		test("should read the client identity from per-request metadata", () => {
			const envelope = modernEnvelope("cursor");

			expect(clientNameFromRequestMeta(envelope)).toBe("cursor");
			expect(protocolVersionFromRequestMeta(envelope)).toBe(MODERN_PROTOCOL_VERSION);
		});

		test("should ignore a malformed or absent client identity", () => {
			expect(clientNameFromRequestMeta(undefined)).toBeUndefined();
			expect(clientNameFromRequestMeta({})).toBeUndefined();
			expect(clientNameFromRequestMeta({ [CLIENT_INFO_META_KEY]: "cursor" })).toBeUndefined();
			expect(clientNameFromRequestMeta({ [CLIENT_INFO_META_KEY]: { name: "" } })).toBeUndefined();
			expect(protocolVersionFromRequestMeta({ [PROTOCOL_VERSION_META_KEY]: 42 })).toBeUndefined();
		});

		test("should report the requesting client from _meta, not from initialize", async () => {
			const events: any[] = [];
			const originalFetch = globalThis.fetch;

			globalThis.fetch = (async (input: any, init: any) => {
				events.push(JSON.parse(init.body));
				return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
			}) as typeof fetch;
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;

			const handler = newHandler();
			try {
				const request = modernRequest(1, "tools/call", { name: "mobile_list_available_devices", arguments: {} }, "claude-code");
				await post(handler, request, modernHeaders("tools/call", "mobile_list_available_devices"));

				await expect.poll(() => events.filter(event => event.properties.ToolName === "mobile_list_available_devices").length, { timeout: 5000 }).toBeGreaterThan(0);

				const toolEvent = events.find(event => event.properties.ToolName === "mobile_list_available_devices");
				expect(toolEvent.properties.AgentName).toBe("claude-code");
				expect(toolEvent.properties.ProtocolVersion).toBe(MODERN_PROTOCOL_VERSION);
				expect(toolEvent.properties.ProtocolEra).toBe("modern");
			} finally {
				await handler.close();
				process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
				globalThis.fetch = originalFetch;
			}
		});
	});

	test.describe("legacy interoperability", () => {
		test("should still answer the 2025-era initialize handshake", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, {
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: LEGACY_PROTOCOL_VERSION,
						capabilities: {},
						clientInfo: { name: "legacy-client", version: "0.1.0" },
					},
				});

				expect(response.status).toBe(200);
				expect(response.body.result.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);
				expect(response.body.result.serverInfo.name).toBe("mobile-mcp");
				expect(response.sessionId).toBeNull();
			} finally {
				await handler.close();
			}
		});

		test("should serve legacy tools/list without modern-only result fields", async () => {
			const handler = newHandler();
			try {
				const response = await post(handler, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

				expect(response.status).toBe(200);
				expect(response.body.result.tools.length).toBeGreaterThan(0);
				expect(response.body.result.resultType).toBeUndefined();
				expect(response.body.result.ttlMs).toBeUndefined();
				expect(response.body.result.cacheScope).toBeUndefined();
			} finally {
				await handler.close();
			}
		});
	});
});

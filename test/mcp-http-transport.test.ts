import { test, expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	CLIENT_CAPABILITIES_META_KEY,
	CLIENT_INFO_META_KEY,
	PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { createHttpApp, closeHttpServer } from "../src/http-server";
import { Mobilecli } from "../src/mobilecli";

process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-06-18";
const MAXIMUM_MESSAGE_SIZE = 4 * 1024 * 1024;

interface RunningServer {
	url: string;
	port: number;
	stop: () => Promise<void>;
}

const startServer = async (): Promise<RunningServer> => {
	const { app, close } = createHttpApp();
	const server = await new Promise<http.Server>(resolve => {
		const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
	});

	const port = (server.address() as AddressInfo).port;

	return {
		url: `http://127.0.0.1:${port}/mcp`,
		port,
		stop: () => closeHttpServer(server, close),
	};
};

const modernEnvelope = (clientName: string = "mobile-mcp-tests") => ({
	[PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
	[CLIENT_INFO_META_KEY]: { name: clientName, version: "1.2.3" },
	[CLIENT_CAPABILITIES_META_KEY]: {},
});

test.describe("mcp http transport", () => {

	test.describe("request body limit", () => {
		test("should reject a body larger than 4mb with 413", async () => {
			const server = await startServer();
			try {
				const oversized = JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: { _meta: modernEnvelope(), pad: "x".repeat(5 * 1024 * 1024) },
				});
				expect(oversized.length).toBeGreaterThan(MAXIMUM_MESSAGE_SIZE);

				const response = await fetch(server.url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: oversized,
				});

				expect(response.status).toBe(413);
				const body = await response.json() as any;
				expect(body.error.message).toContain("Payload Too Large");
				// the request never reached the mcp server
				expect(body.result).toBeUndefined();
			} finally {
				await server.stop();
			}
		});

		test("should reject an oversized body without buffering it", async () => {
			const server = await startServer();
			let request: http.ClientRequest | undefined;

			try {
				const declaredLength = 64 * 1024 * 1024;
				let bytesWritten = 0;

				const status = await new Promise<number>((resolve, reject) => {
					request = http.request({
						host: "127.0.0.1",
						port: server.port,
						path: "/mcp",
						method: "POST",
						headers: {
							"content-type": "application/json",
							"content-length": String(declaredLength),
						},
					});

					request.on("response", response => {
						response.resume();
						resolve(response.statusCode ?? 0);
					});

					// the socket is torn down once the request is refused, which must
					// not fail the test
					request.on("error", error => {
						if (bytesWritten === 0) {
							reject(error);
						}
					});

					const chunk = "x".repeat(1024);
					request.write(chunk);
					bytesWritten += chunk.length;

					setTimeout(() => reject(new Error("no response to the oversized request")), 10_000);
				});

				// the declared length is refused up front, so the body is never read:
				// only the 1kb probe chunk was ever put on the wire
				expect(status).toBe(413);
				expect(bytesWritten).toBe(1024);
			} finally {
				request?.destroy();
				await server.stop();
			}
		});

		test("should reject an oversized chunked body that declares no length", async () => {
			const server = await startServer();
			try {
				const payload = "x".repeat(5 * 1024 * 1024);
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(`{"pad":"${payload}"}`));
						controller.close();
					},
				});

				const response = await fetch(server.url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
					duplex: "half",
				} as RequestInit);

				expect(response.status).toBe(413);
				const parsed = await response.json() as any;
				expect(parsed.error.message).toContain("Payload Too Large");
			} finally {
				await server.stop();
			}
		});

		test("should still serve an ordinary modern request", async () => {
			const server = await startServer();
			try {
				const response = await fetch(server.url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"accept": "application/json, text/event-stream",
						"MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
						"Mcp-Method": "server/discover",
					},
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: modernEnvelope() } }),
				});

				expect(response.status).toBe(200);
				const body = await response.json() as any;
				expect(body.result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
			} finally {
				await server.stop();
			}
		});

		test("should still serve an ordinary legacy streamable http request", async () => {
			const server = await startServer();
			try {
				const response = await fetch(server.url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"accept": "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: LEGACY_PROTOCOL_VERSION,
							capabilities: {},
							clientInfo: { name: "legacy-client", version: "0.1.0" },
						},
					}),
				});

				expect(response.status).toBe(200);
				const text = await response.text();
				expect(text).toContain(`"protocolVersion":"${LEGACY_PROTOCOL_VERSION}"`);
			} finally {
				await server.stop();
			}
		});

		test("should answer an unparsable body with a json-rpc parse error", async () => {
			const server = await startServer();
			try {
				const response = await fetch(server.url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{ not json",
				});

				expect(response.status).toBe(400);
				const body = await response.json() as any;
				expect(body.error.code).toBe(-32700);
			} finally {
				await server.stop();
			}
		});
	});

	test.describe("legacy http+sse transport", () => {
		test("should serve the deprecated sse transport on GET /mcp", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.url)));

				expect(client.getServerVersion()?.name).toBe("mobile-mcp");

				const tools = await client.listTools();
				const toolNames = tools.tools.map(tool => tool.name);
				expect(toolNames).toContain("mobile_list_available_devices");
				expect(toolNames).toContain("mobile_take_screenshot");
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should refuse a second concurrent sse stream", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.url)));

				const second = await fetch(server.url, { headers: { accept: "text/event-stream" } });
				expect(second.status).toBe(409);
				await second.body?.cancel();
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should not route a modern post to the sse stream", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.url)));

				const response = await fetch(server.url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"accept": "application/json, text/event-stream",
						"MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
						"Mcp-Method": "server/discover",
					},
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: modernEnvelope() } }),
				});

				expect(response.status).toBe(200);
				const body = await response.json() as any;
				expect(body.result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should reject a post carrying an unknown sse session id", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.url)));

				const response = await fetch(`${server.url}?sessionId=not-the-open-session`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
				});

				expect(response.status).toBe(404);
				const body = await response.json() as any;
				expect(body.error).toBe("Unknown sse session id");
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should accept a post carrying the advertised sse session id", async () => {
			const server = await startServer();
			try {
				const stream = await fetch(server.url, { headers: { accept: "text/event-stream" } });
				const reader = stream.body!.getReader();
				const announcement = new TextDecoder().decode((await reader.read()).value);
				const sessionId = new URL(announcement.split("data: ")[1].trim(), server.url).searchParams.get("sessionId");

				expect(sessionId).toBeTruthy();

				const response = await fetch(`${server.url}?sessionId=${sessionId}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2024-11-05",
							capabilities: {},
							clientInfo: { name: "raw-sse-client", version: "1.0.0" },
						},
					}),
				});

				expect(response.status).toBe(202);

				await reader.cancel();
			} finally {
				await server.stop();
			}
		});
	});

	test.describe("streamable http and legacy sse coexistence", () => {
		test("should not let a streamable http client occupy the legacy sse slot", async () => {
			const server = await startServer();
			const streamableClient = new Client({ name: "streamable-regression", version: "1.0.0" });
			const sseClient = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				// a v1 streamable http client opens its optional listening GET right
				// after connecting; that GET must not take the single sse slot
				await streamableClient.connect(new StreamableHTTPClientTransport(new URL(server.url)));
				expect(streamableClient.getServerVersion()?.name).toBe("mobile-mcp");

				// the genuine 2024-11-05 client can still open the stream
				await sseClient.connect(new SSEClientTransport(new URL(server.url)));
				expect(sseClient.getServerVersion()?.name).toBe("mobile-mcp");

				// and both keep working side by side
				const streamableTools = await streamableClient.listTools();
				const sseTools = await sseClient.listTools();
				expect(streamableTools.tools.length).toBeGreaterThan(0);
				expect(sseTools.tools.length).toBe(streamableTools.tools.length);
			} finally {
				await sseClient.close();
				await streamableClient.close();
				await server.stop();
			}
		});

		test("should answer a streamable http listening stream with 405", async () => {
			const server = await startServer();
			try {
				const withProtocolVersion = await fetch(server.url, {
					headers: { "accept": "text/event-stream", "mcp-protocol-version": LEGACY_PROTOCOL_VERSION },
				});
				const withSessionId = await fetch(server.url, {
					headers: { "accept": "text/event-stream", "mcp-session-id": "some-session" },
				});

				expect(withProtocolVersion.status).toBe(405);
				expect(withSessionId.status).toBe(405);
				await withProtocolVersion.body?.cancel();
				await withSessionId.body?.cancel();

				// and the legacy slot is still free afterwards
				const stream = await fetch(server.url, { headers: { accept: "text/event-stream" } });
				expect(stream.status).toBe(200);
				expect(stream.headers.get("content-type")).toContain("text/event-stream");
				await stream.body?.cancel();
			} finally {
				await server.stop();
			}
		});
	});

	test.describe("shutdown", () => {
		test("should release the handler and an open sse stream", async () => {
			const { app, close } = createHttpApp();
			const server = await new Promise<http.Server>(resolve => {
				const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
			});

			const port = (server.address() as AddressInfo).port;
			const client = new Client({ name: "shutdown-regression", version: "1.0.0" });
			await client.connect(new SSEClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

			// an open sse stream would otherwise hold the listener open forever
			await closeHttpServer(server, close);

			expect(server.listening).toBe(false);
			await expect(fetch(`http://127.0.0.1:${port}/mcp`, { headers: { accept: "text/event-stream" } })).rejects.toThrow();

			await client.close();
		});
	});

	test.describe("telemetry attribution", () => {
		test("should attribute get_robot events to the requesting client", async () => {
			const events: any[] = [];
			const originalFetch = globalThis.fetch;
			const originalGetVersion = Mobilecli.prototype.getVersion;
			const originalGetDevices = Mobilecli.prototype.getDevices;

			Mobilecli.prototype.getVersion = () => "1.0.0";
			Mobilecli.prototype.getDevices = () => ({
				status: "ok",
				data: {
					devices: [{
						id: "telemetry-device",
						name: "Telemetry Device",
						platform: "android",
						type: "emulator",
						version: "14",
						state: "online",
					}],
				},
			}) as any;

			globalThis.fetch = (async (input: any, init: any) => {
				if (typeof input === "string" && input.includes("posthog.com")) {
					events.push(JSON.parse(init.body));
					return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
				}

				return originalFetch(input, init);
			}) as typeof fetch;
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;

			const server = await startServer();
			try {
				await fetch(server.url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"accept": "application/json, text/event-stream",
						"MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
						"Mcp-Method": "tools/call",
						"Mcp-Name": "mobile_get_orientation",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "tools/call",
						params: {
							name: "mobile_get_orientation",
							arguments: { device: "telemetry-device" },
							_meta: modernEnvelope("windsurf"),
						},
					}),
				});

				await expect.poll(() => events.filter(event => event.event === "get_robot").length, { timeout: 5000 }).toBeGreaterThan(0);

				const robotEvent = events.find(event => event.event === "get_robot");
				expect(robotEvent.properties.DevicePlatform).toBe("android");
				expect(robotEvent.properties.AgentName).toBe("windsurf");
				expect(robotEvent.properties.ProtocolVersion).toBe(MODERN_PROTOCOL_VERSION);
				expect(robotEvent.properties.ProtocolEra).toBe("modern");
			} finally {
				await server.stop();
				process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
				globalThis.fetch = originalFetch;
				Mobilecli.prototype.getVersion = originalGetVersion;
				Mobilecli.prototype.getDevices = originalGetDevices;
			}
		});
	});
});

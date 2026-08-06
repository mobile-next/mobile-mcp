import { test, expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
	CLIENT_CAPABILITIES_META_KEY,
	CLIENT_INFO_META_KEY,
	PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { createHttpApp, closeHttpServer, createShutdownHandler, listenHttpServer } from "../src/http-server";
import { Mobilecli } from "../src/mobilecli";

process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-06-18";
const MAXIMUM_MESSAGE_SIZE = 4 * 1024 * 1024;

interface RunningServer {
	url: string;
	sseUrl: string;
	port: number;
	server: http.Server;
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
		sseUrl: `http://127.0.0.1:${port}/sse`,
		port,
		server,
		stop: () => closeHttpServer(server, close),
	};
};

/** Polls until the client's transport works again, as a reconnect is asynchronous. */
const waitUntilUsable = async (client: Client, timeoutMs: number): Promise<boolean> => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			if ((await client.listTools()).tools.length > 0) {
				return true;
			}
		} catch (err: any) {
			await new Promise(resolve => setTimeout(resolve, 250));
		}
	}

	return false;
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
					const timer = setTimeout(() => reject(new Error("no response to the oversized request")), 10_000);
					const settle = (outcome: () => void) => {
						clearTimeout(timer);
						outcome();
					};

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
						settle(() => resolve(response.statusCode ?? 0));
					});

					// the socket is torn down once the request is refused, which must
					// not fail the test
					request.on("error", error => {
						if (bytesWritten === 0) {
							settle(() => reject(error));
						}
					});

					const chunk = "x".repeat(1024);
					request.write(chunk);
					bytesWritten += chunk.length;
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

		test("should forward a rejecting route handler as an internal error", async () => {
			const server = await startServer();
			const originalHandlePostMessage = SSEServerTransport.prototype.handlePostMessage;

			try {
				const stream = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
				const reader = stream.body!.getReader();
				const announcement = new TextDecoder().decode((await reader.read()).value);
				const sessionId = new URL(announcement.split("data: ")[1].trim(), server.url).searchParams.get("sessionId");

				// the legacy message route awaits the transport; a rejection there
				// used to be dropped on the floor, leaving the request hanging
				SSEServerTransport.prototype.handlePostMessage = async function handlePostMessage() {
					throw new Error("transport exploded");
				};

				const response = await fetch(`${server.url}?sessionId=${sessionId}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
				});

				expect(response.status).toBe(500);
				const body = await response.json() as any;
				expect(body.error.code).toBe(-32603);
				expect(body.error.message).toBe("Internal error");

				await reader.cancel();
			} finally {
				SSEServerTransport.prototype.handlePostMessage = originalHandlePostMessage;
				await server.stop();
			}
		});
	});

	test.describe("legacy http+sse transport", () => {
		test("should serve the deprecated sse transport on its own path", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.sseUrl)));

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

		test("should redirect a bare GET /mcp to the sse path permanently", async () => {
			const server = await startServer();
			try {
				const response = await fetch(server.url, {
					headers: { accept: "text/event-stream" },
					redirect: "manual",
				});

				expect(response.status).toBe(301);
				expect(response.headers.get("location")).toBe("/sse");
				await response.body?.cancel();
			} finally {
				await server.stop();
			}
		});

		test("should serve a client configured at /mcp through the redirect", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.url)));

				expect(client.getServerVersion()?.name).toBe("mobile-mcp");
				const tools = await client.listTools();
				expect(tools.tools.length).toBeGreaterThan(0);

				// tool calls travel on the advertised POST endpoint
				const result = await client.callTool({ name: "mobile_list_available_devices", arguments: {} }) as any;
				expect(result.content[0].type).toBe("text");
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should reconnect automatically after its stream is dropped", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.sseUrl)));
				expect((await client.listTools()).tools.length).toBeGreaterThan(0);

				// forcibly drop the sse response, as a proxy or a network blip would
				server.server.closeAllConnections();

				// the client re-establishes the stream on its own, receives a fresh
				// endpoint event, and is usable again without reconnecting by hand
				expect(await waitUntilUsable(client, 30_000)).toBe(true);
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should serve concurrent sse streams", async () => {
			const server = await startServer();
			const first = new Client({ name: "sse-first", version: "1.0.0" });
			const second = new Client({ name: "sse-second", version: "1.0.0" });

			try {
				await first.connect(new SSEClientTransport(new URL(server.sseUrl)));
				await second.connect(new SSEClientTransport(new URL(server.sseUrl)));

				// no single slot means no client can lock another one out
				expect((await first.listTools()).tools.length).toBeGreaterThan(0);
				expect((await second.listTools()).tools.length).toBeGreaterThan(0);
			} finally {
				await second.close();
				await first.close();
				await server.stop();
			}
		});

		test("should reconnect a client configured at /mcp after its stream is dropped", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				// the endpoint clients were configured with before /sse existed
				await client.connect(new SSEClientTransport(new URL(server.url)));
				expect((await client.listTools()).tools.length).toBeGreaterThan(0);

				// forcibly drop the sse response, as a proxy or a network blip would
				server.server.closeAllConnections();

				// the client re-establishes on its own, even though its reconnect now
				// reports a protocol version and reaches /mcp rather than /sse
				expect(await waitUntilUsable(client, 30_000)).toBe(true);

				const result = await client.callTool({ name: "mobile_list_available_devices", arguments: {} }) as any;
				expect(result.content[0].type).toBe("text");
			} finally {
				await client.close();
				await server.stop();
			}
		});

		test("should close a stream whose connect fails after the response was announced", async () => {
			const server = await startServer();
			const originalStart = SSEServerTransport.prototype.start;

			// fail once the head and the endpoint event are already on the wire, so
			// the failure cannot be reported as a status code
			SSEServerTransport.prototype.start = async function start() {
				await originalStart.call(this);
				throw new Error("connect failed after headers");
			};

			try {
				const response = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
				expect(response.status).toBe(200);

				// the response is ended rather than left open forever
				await response.text();

				// and the slot it held was released
				SSEServerTransport.prototype.start = originalStart;
				const healthy = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
				expect(healthy.status).toBe(200);
				await healthy.body?.cancel();
			} finally {
				SSEServerTransport.prototype.start = originalStart;
				await server.stop();
			}
		});

		test("should classify a GET by the cache signature every EventSource sends", async () => {
			const server = await startServer();
			try {
				const get = (headers: Record<string, string>) => fetch(server.url, {
					headers: { "accept": "text/event-stream", "mcp-protocol-version": LEGACY_PROTOCOL_VERSION, ...headers },
					redirect: "manual",
				});

				// what the shipped EventSource sends, and what survives an
				// intermediary that drops one of the two headers
				const both = await get({ "cache-control": "no-cache", "pragma": "no-cache" });
				const cacheControlOnly = await get({ "cache-control": "no-cache" });
				const pragmaOnly = await get({ pragma: "no-cache" });
				const noStore = await get({ "cache-control": "no-store" });
				const listOfDirectives = await get({ "cache-control": "max-age=0, no-cache" });

				// a Streamable HTTP listening GET carries none of them
				const neither = await get({});

				expect(both.status).toBe(301);
				expect(cacheControlOnly.status).toBe(301);
				expect(pragmaOnly.status).toBe(301);
				expect(noStore.status).toBe(301);
				expect(listOfDirectives.status).toBe(301);
				expect(neither.status).toBe(405);

				await Promise.all([both, cacheControlOnly, pragmaOnly, noStore, listOfDirectives, neither]
					.map(response => response.body?.cancel()));
			} finally {
				await server.stop();
			}
		});

		test("should not treat an unrelated cache directive as an sse stream", async () => {
			const server = await startServer();
			try {
				const response = await fetch(server.url, {
					headers: {
						"accept": "text/event-stream",
						"mcp-protocol-version": LEGACY_PROTOCOL_VERSION,
						"cache-control": "max-age=600",
					},
					redirect: "manual",
				});

				expect(response.status).toBe(405);
				await response.body?.cancel();
			} finally {
				await server.stop();
			}
		});

		test("should classify a GET carrying our stream marker as sse", async () => {
			const server = await startServer();
			try {
				// a spec-compliant EventSource re-establishes with the id the stream
				// stamped, even while reporting a protocol version
				const response = await fetch(server.url, {
					headers: {
						"accept": "text/event-stream",
						"mcp-protocol-version": LEGACY_PROTOCOL_VERSION,
						"last-event-id": "mobile-mcp-sse-any-previous-session",
					},
					redirect: "manual",
				});

				expect(response.status).toBe(301);
				expect(response.headers.get("location")).toBe("/sse");
				await response.body?.cancel();
			} finally {
				await server.stop();
			}
		});

		test("should refuse streams beyond the concurrency limit", async () => {
			const server = await startServer();
			const streams: Response[] = [];

			try {
				for (let index = 0; index < 8; index++) {
					const stream = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
					expect(stream.status).toBe(200);
					streams.push(stream);
				}

				const beyondLimit = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
				expect(beyondLimit.status).toBe(429);
				await beyondLimit.body?.cancel();
			} finally {
				await Promise.all(streams.map(stream => stream.body?.cancel()));
				await server.stop();
			}
		});

		test("should not route a modern post to the sse stream", async () => {
			const server = await startServer();
			const client = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				await client.connect(new SSEClientTransport(new URL(server.sseUrl)));

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
				await client.connect(new SSEClientTransport(new URL(server.sseUrl)));

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
				const stream = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
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
		test("should not let a streamable http client occupy an sse stream", async () => {
			const server = await startServer();
			const streamableClient = new Client({ name: "streamable-regression", version: "1.0.0" });
			const sseClient = new Client({ name: "sse-regression", version: "1.0.0" });

			try {
				// a v1 streamable http client opens its optional listening GET right
				// after connecting; that GET must never become an http+sse stream
				await streamableClient.connect(new StreamableHTTPClientTransport(new URL(server.url)));
				expect(streamableClient.getServerVersion()?.name).toBe("mobile-mcp");

				// the genuine 2024-11-05 client still gets its stream
				await sseClient.connect(new SSEClientTransport(new URL(server.sseUrl)));
				expect(sseClient.getServerVersion()?.name).toBe("mobile-mcp");

				// and both keep working side by side
				const streamableTools = await streamableClient.listTools();
				const sseTools = await sseClient.listTools();
				expect(streamableTools.tools.length).toBeGreaterThan(0);
				expect(sseTools.tools.length).toBe(streamableTools.tools.length);

				// the streamable client holds no stream: all remaining slots are free
				const streams: Response[] = [];
				for (let index = 0; index < 7; index++) {
					const stream = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
					expect(stream.status).toBe(200);
					streams.push(stream);
				}

				await Promise.all(streams.map(stream => stream.body?.cancel()));
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
					redirect: "manual",
				});
				const withSessionId = await fetch(server.url, {
					headers: { "accept": "text/event-stream", "mcp-session-id": "some-session" },
					redirect: "manual",
				});

				expect(withProtocolVersion.status).toBe(405);
				expect(withSessionId.status).toBe(405);
				await withProtocolVersion.body?.cancel();
				await withSessionId.body?.cancel();

				// and the sse path is untouched by them
				const stream = await fetch(server.sseUrl, { headers: { accept: "text/event-stream" } });
				expect(stream.status).toBe(200);
				expect(stream.headers.get("content-type")).toContain("text/event-stream");
				await stream.body?.cancel();
			} finally {
				await server.stop();
			}
		});
	});

	test.describe("authorization", () => {

		/**
		 * Runs the body with an authenticated server, restoring the environment
		 * whether or not the app, the listener, or the body itself got that far.
		 */
		const withAuthToken = async (token: string, run: (port: number) => Promise<void>): Promise<void> => {
			const previous = process.env.MOBILEMCP_AUTH;
			let close: (() => Promise<void>) | undefined;
			let server: http.Server | undefined;

			try {
				process.env.MOBILEMCP_AUTH = token;

				const created = createHttpApp();
				close = created.close;
				server = await new Promise<http.Server>(resolve => {
					const listening = created.app.listen(0, "127.0.0.1", () => resolve(listening));
				});

				await run((server.address() as AddressInfo).port);
			} finally {
				if (server !== undefined && close !== undefined) {
					await closeHttpServer(server, close);
				} else {
					await close?.();
				}

				if (previous === undefined) {
					delete process.env.MOBILEMCP_AUTH;
				} else {
					process.env.MOBILEMCP_AUTH = previous;
				}
			}
		};

		test("should accept only the configured bearer token", async () => {
			await withAuthToken("s3cret-token", async port => {
				const get = (headers: Record<string, string>) => fetch(`http://127.0.0.1:${port}/mcp`, {
					headers: { accept: "text/event-stream", ...headers },
					redirect: "manual",
				});

				const missing = await get({});
				const wrong = await get({ authorization: "Bearer wrong-token" });
				const wrongScheme = await get({ authorization: "s3cret-token" });
				const correct = await get({ authorization: "Bearer s3cret-token" });

				expect(missing.status).toBe(401);
				expect(wrong.status).toBe(401);
				expect(wrongScheme.status).toBe(401);
				expect(correct.status).toBe(301);

				await Promise.all([missing, wrong, wrongScheme, correct].map(response => response.body?.cancel()));
			});
		});

		test("should guard the sse path and posts too", async () => {
			await withAuthToken("s3cret-token", async port => {
				const sse = await fetch(`http://127.0.0.1:${port}/sse`, { headers: { accept: "text/event-stream" } });
				const post = await fetch(`http://127.0.0.1:${port}/mcp`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
				});

				expect(sse.status).toBe(401);
				expect(post.status).toBe(401);
				await Promise.all([sse, post].map(response => response.body?.cancel()));
			});
		});

		test("should restore the environment when setup fails", async () => {
			const previous = process.env.MOBILEMCP_AUTH;

			await expect(withAuthToken("s3cret-token", async () => {
				throw new Error("body failed");
			})).rejects.toThrow("body failed");

			expect(process.env.MOBILEMCP_AUTH).toBe(previous);
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

			try {
				await client.connect(new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`)));

				// an open sse stream would otherwise hold the listener open forever
				await closeHttpServer(server, close);

				expect(server.listening).toBe(false);
				await expect(fetch(`http://127.0.0.1:${port}/mcp`, { headers: { accept: "text/event-stream" } })).rejects.toThrow();
			} finally {
				await client.close();
				await closeHttpServer(server, close);
			}
		});

		test("should run the shutdown sequence once however many signals arrive", async () => {
			const { app } = createHttpApp();
			const server = await new Promise<http.Server>(resolve => {
				const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
			});

			try {
				let closeCalls = 0;
				let settledCalls = 0;
				const shutdown = createShutdownHandler(server, async () => {
					closeCalls++;
				}, () => {
					settledCalls++;
				});

				shutdown();
				shutdown();
				shutdown();

				await expect.poll(() => settledCalls, { timeout: 5000 }).toBe(1);
				expect(closeCalls).toBe(1);
			} finally {
				server.closeAllConnections();
				await new Promise<void>(resolve => server.close(() => resolve()));
			}
		});

		test("should give up waiting on a resource that never closes", async () => {
			const { app } = createHttpApp();
			const server = await new Promise<http.Server>(resolve => {
				const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
			});

			try {
				const startedAt = Date.now();
				await closeHttpServer(server, () => new Promise<void>(() => {}), 250);

				expect(Date.now() - startedAt).toBeLessThan(5_000);
			} finally {
				server.closeAllConnections();
				await new Promise<void>(resolve => server.close(() => resolve()));
			}
		});

		test("should report a bind failure instead of throwing it", async () => {
			const first = createHttpApp();
			const firstServer = await new Promise<http.Server>(resolve => {
				const listening = first.app.listen(0, "127.0.0.1", () => resolve(listening));
			});

			const port = (firstServer.address() as AddressInfo).port;
			const second = createHttpApp();
			let secondServer: http.Server | undefined;

			try {
				const bindError = await new Promise<NodeJS.ErrnoException>(resolve => {
					secondServer = listenHttpServer(second.app, "127.0.0.1", port, () => {}, resolve);
				});

				expect(bindError.code).toBe("EADDRINUSE");
			} finally {
				secondServer?.close();
				await closeHttpServer(firstServer, first.close);
			}
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

			let server: RunningServer | undefined;
			try {
				server = await startServer();
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
				await server?.stop();
				process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
				globalThis.fetch = originalFetch;
				Mobilecli.prototype.getVersion = originalGetVersion;
				Mobilecli.prototype.getDevices = originalGetDevices;
			}
		});
	});
});

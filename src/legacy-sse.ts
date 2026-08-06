import type { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/server";

import { createMcpServer } from "./server";
import { error } from "./logger";

/**
 * The deprecated HTTP+SSE transport (protocol revision 2024-11-05): the client
 * opens a stream with `GET`, and posts messages back to the endpoint the stream
 * advertises, `POST /mcp?sessionId=...`.
 *
 * MCP SDK v2 dropped this transport, so it is served here by the v1 transport
 * implementation, deliberately isolated in this module. Everything else —
 * modern 2026-07-28 traffic and 2025-era Streamable HTTP — is served by the v2
 * entry, and both share the same tool surface because `createMcpServer` builds
 * it once.
 *
 * The transport owns a dedicated path (`/sse`) rather than sharing `GET /mcp`,
 * because a shared GET cannot be classified: once a client has learned a
 * protocol version, an `EventSource` reconnect is byte for byte the listening
 * GET a Streamable HTTP client opens. Streams are also concurrent here — the
 * pre-migration single-stream server could be locked out by one misrouted GET,
 * and nothing routed to this endpoint can now deny another client a stream.
 */
export interface LegacySseEndpoint {
	/** Whether this GET belongs to the HTTP+SSE transport rather than to Streamable HTTP. */
	isStreamRequest: (req: Request) => boolean;
	/** Whether this POST addresses an HTTP+SSE stream rather than the Streamable HTTP path. */
	isMessageRequest: (req: Request) => boolean;
	/** Opens an SSE stream. */
	openStream: (req: Request, res: Response) => Promise<void>;
	/** Delivers a posted message to its stream (`POST /mcp?sessionId=...`). */
	handleMessage: (req: Request, res: Response) => Promise<void>;
	/** The number of open streams. */
	readonly openStreamCount: number;
	/** Tears down every open stream. */
	close: () => Promise<void>;
}

/**
 * Prefix of the last event id stamped on every stream. A spec-compliant
 * `EventSource` echoes it in `Last-Event-ID` when it re-establishes a stream —
 * including through a redirect — which identifies the request as this
 * transport's beyond doubt. No Streamable HTTP stream is ever stamped with it,
 * so it cannot collide.
 *
 * SDK v1's own `SSEClientTransport` does not send it: it hands `EventSource` a
 * custom `fetch` that replaces the request headers wholesale, dropping the
 * `Last-Event-ID` the package had put there. Those clients are recognised by
 * their cache signature instead.
 */
const STREAM_EVENT_ID_PREFIX = "mobile-mcp-sse-";

/**
 * Headers a Streamable HTTP client attaches to the listening GET it opens once
 * connected. They are only consulted once the HTTP+SSE signals below have been
 * ruled out — a re-establishing `EventSource` reports a protocol version too.
 */
const STREAMABLE_HTTP_GET_HEADERS = ["mcp-session-id", "mcp-protocol-version"];

const headerValue = (req: Request, name: string): string | undefined => {
	const header = req.headers[name];
	return Array.isArray(header) ? header[0] : header;
};

const hasDirective = (value: string | undefined, directives: string[]): boolean => {
	if (value === undefined) {
		return false;
	}

	return value.split(",").some(directive => directives.includes(directive.trim().toLowerCase().split("=")[0]));
};

/**
 * Whether a GET carries the cache signature every `EventSource` request has and
 * no Streamable HTTP request has.
 *
 * It is structural rather than incidental: the `eventsource` package issues its
 * request with fetch cache mode `no-store` (SDK v1's `SSEClientTransport`
 * replaces only the headers of that request init, so the mode survives), and
 * the Fetch standard requires a `no-store` request to be given `pragma:
 * no-cache` and `cache-control: no-cache` in the HTTP-network-or-cache step.
 * `StreamableHTTPClientTransport` issues its listening GET with the default
 * cache mode, so it is given neither.
 *
 * Either header alone is accepted: an intermediary that drops one must not cost
 * a client its stream. Matching too eagerly only hands a Streamable HTTP client
 * a stream it ignores — one of several, and it holds nothing else — while
 * matching too strictly answers a reconnect with `405` and ends the connection
 * for good.
 */
const hasEventSourceCacheSignature = (req: Request): boolean => {
	return hasDirective(headerValue(req, "cache-control"), ["no-cache", "no-store"])
		|| hasDirective(headerValue(req, "pragma"), ["no-cache"]);
};

/** Concurrent streams this endpoint will hold open. */
const MAXIMUM_OPEN_STREAMS = 8;

export const createLegacySseEndpoint = (endpoint: string): LegacySseEndpoint => {

	const transports = new Map<string, SSEServerTransport>();

	const isStreamRequest = (req: Request): boolean => {
		if (headerValue(req, "last-event-id")?.startsWith(STREAM_EVENT_ID_PREFIX)) {
			return true;
		}

		if (hasEventSourceCacheSignature(req)) {
			return true;
		}

		return !STREAMABLE_HTTP_GET_HEADERS.some(header => req.headers[header] !== undefined);
	};

	const isMessageRequest = (req: Request): boolean => {
		return typeof req.query.sessionId === "string";
	};

	const openStream = async (req: Request, res: Response): Promise<void> => {
		if (transports.size >= MAXIMUM_OPEN_STREAMS) {
			res.status(429).json({ error: `Too many open sse streams (limit ${MAXIMUM_OPEN_STREAMS})` });
			return;
		}

		const transport = new SSEServerTransport(endpoint, res);
		transports.set(transport.sessionId, transport);

		transport.onclose = () => {
			transports.delete(transport.sessionId);
		};

		try {
			// The v1 transport predates the v2 Transport type but implements the
			// same start/send/close/onmessage contract the v2 server drives.
			const server = createMcpServer({ era: "legacy" });
			await server.connect(transport as unknown as Transport);

			// Stamp the stream so a re-establishing client can identify itself. The
			// event type is one no MCP client acts on, so it is ignored on arrival
			// and only its id is remembered.
			res.write(`id: ${STREAM_EVENT_ID_PREFIX}${transport.sessionId}\nevent: mobile-mcp-stream\ndata: {}\n\n`);
		} catch (err: any) {
			transports.delete(transport.sessionId);
			error(`legacy sse connect failed: ${err.message}`);
			if (!res.headersSent) {
				res.status(500).json({ error: "Failed to open the sse stream" });
			}
		}
	};

	const handleMessage = async (req: Request, res: Response): Promise<void> => {
		// Only the session an open stream advertised may post to it.
		const sessionId = req.query.sessionId;
		const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
		if (!transport) {
			res.status(404).json({ error: "Unknown sse session id" });
			return;
		}

		// req.body was already parsed under the endpoint's size limit, so the
		// transport never reads the request stream itself.
		await transport.handlePostMessage(req, res, req.body);
	};

	const close = async (): Promise<void> => {
		const open = [...transports.values()];
		transports.clear();
		await Promise.all(open.map(transport => transport.close()));
	};

	return {
		isStreamRequest,
		isMessageRequest,
		openStream,
		handleMessage,
		close,
		get openStreamCount() {
			return transports.size;
		},
	};
};

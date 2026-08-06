import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express from "express";
import type { Server } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

import { createMcpServer } from "./server";
import { createLegacySseEndpoint } from "./legacy-sse";
import { error } from "./logger";

export const MCP_ENDPOINT = "/mcp";
export const SSE_ENDPOINT = "/sse";

/**
 * The cap MCP SDK v1 enforced on posted message bodies. The v2 node adapter
 * buffers whatever the request stream yields, so the limit has to be applied
 * here, before the body reaches it.
 */
export const MAXIMUM_MESSAGE_SIZE = "4mb";
export const MAXIMUM_MESSAGE_SIZE_BYTES = 4 * 1024 * 1024;

/** Time the shutdown sequence is given before the process stops waiting for it. */
export const SHUTDOWN_TIMEOUT_MS = 5_000;

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** The shape body-parser gives its failures. */
interface BodyParserError extends Error {
	type: string;
}

/** Narrows a thrown value to a body-parser failure, which names itself in `type`. */
const isBodyParserError = (err: unknown): err is BodyParserError => {
	return err instanceof Error && "type" in err && typeof err.type === "string";
};

const describeError = (err: unknown): string => {
	return err instanceof Error ? err.message : String(err);
};

const payloadTooLarge = () => ({
	jsonrpc: "2.0",
	error: { code: -32000, message: `Payload Too Large: request body exceeds ${MAXIMUM_MESSAGE_SIZE}` },
	id: null,
});

export interface HttpApp {
	app: express.Express;
	close: () => Promise<void>;
}

export const createHttpApp = (): HttpApp => {
	const app = express();

	const authToken = process.env.MOBILEMCP_AUTH;
	if (!authToken) {
		error("WARNING: MOBILEMCP_AUTH is not set. The http server will accept unauthenticated connections. Set MOBILEMCP_AUTH to require Bearer token authentication.");
	}

	if (authToken) {
		const expected = digest(`Bearer ${authToken}`);
		app.use((req, res, next) => {
			// Compared as fixed-length digests so the check takes the same time
			// whatever the supplied credential is, and leaks no length either.
			if (!timingSafeEqual(digest(req.headers.authorization ?? ""), expected)) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			next();
		});
	}

	// Block cross-origin requests — MCP clients are not browsers
	app.use((req, res, next) => {
		if (req.headers.origin) {
			res.status(403).json({ error: "Cross-origin requests are not allowed" });
			return;
		}

		if (req.method === "OPTIONS") {
			res.status(403).end();
			return;
		}

		next();
	});

	// Reject an oversized body from its declared length, before a single byte is
	// read. body-parser also enforces the limit, but only after draining the
	// request, so this keeps the fail-fast behavior MCP SDK v1 had.
	app.use(MCP_ENDPOINT, (req, res, next) => {
		const declaredLength = Number(req.headers["content-length"]);
		if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_MESSAGE_SIZE_BYTES) {
			res.status(413).json(payloadTooLarge());
			return;
		}

		next();
	});

	// Bound every posted body before the v2 node adapter (or the v1 sse
	// transport) sees it: both would otherwise buffer an arbitrarily large
	// request into memory. Parsing every content type keeps the body out of the
	// adapter's own unbounded reader; the servers still apply their own
	// content-type rules to what they receive.
	app.use(MCP_ENDPOINT, express.json({ limit: MAXIMUM_MESSAGE_SIZE, type: () => true }));

	// Modern (2026-07-28) requests are stateless and self-contained, so a fresh
	// server instance serves every request. `legacy: "stateless"` keeps 2025-era
	// Streamable HTTP clients working on the same endpoint, with no session
	// singleton.
	const handler = createMcpHandler(createMcpServer, {
		legacy: "stateless",
		onerror: err => error(`mcp http error: ${err.message}`),
	});

	const streamableHttp = toNodeHandler(handler, {
		onerror: err => error(`mcp http handler error: ${err.message}`),
	});

	// The deprecated HTTP+SSE transport (2024-11-05) owns its own path, so a
	// reconnecting EventSource never has to be told apart from a Streamable HTTP
	// listening GET on shared ground. See src/legacy-sse.ts.
	const legacySse = createLegacySseEndpoint(MCP_ENDPOINT);

	app.get(SSE_ENDPOINT, (req, res) => legacySse.openStream(req, res));

	app.get(MCP_ENDPOINT, (req, res) => {
		// A Streamable HTTP client opens an optional listening stream with GET
		// after connecting. It must reach the modern handler and get the 405 it
		// expects, never an HTTP+SSE stream.
		if (!legacySse.isStreamRequest(req)) {
			return streamableHttp(req, res, req.body);
		}

		// Everything else on this GET belongs to the HTTP+SSE transport — a client
		// opening a stream, or re-establishing one — and is sent to the path that
		// owns it. The redirect is followed on every attempt, so a client still
		// configured against /mcp keeps working.
		res.redirect(301, SSE_ENDPOINT);
	});

	app.post(MCP_ENDPOINT, (req, res) => {
		if (legacySse.isMessageRequest(req)) {
			return legacySse.handleMessage(req, res);
		}

		return streamableHttp(req, res, req.body);
	});

	app.all(MCP_ENDPOINT, (req, res) => streamableHttp(req, res, req.body));

	// Mounted for the whole app, not just one endpoint, so a rejection from any
	// route reaches it. Express 5 forwards a returned rejected promise here.
	app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
		if (res.headersSent) {
			next(err);
			return;
		}

		if (isBodyParserError(err)) {
			if (err.type === "entity.too.large") {
				res.status(413).json(payloadTooLarge());
				return;
			}

			// every other body-parser failure is a malformed request body
			res.status(400).json({
				jsonrpc: "2.0",
				error: { code: -32700, message: "Parse error" },
				id: null,
			});
			return;
		}

		error(`mcp http request failed: ${describeError(err)}`);
		res.status(500).json({
			jsonrpc: "2.0",
			error: { code: -32603, message: "Internal error" },
			id: null,
		});
	});

	const close = async () => {
		await legacySse.close();
		await handler.close();
	};

	return { app, close };
};

/**
 * Shuts an mcp http server down: the mcp resources first — the modern handler's
 * in-flight exchanges and the open sse streams, which would otherwise hold the
 * listener open indefinitely — then the listener itself.
 *
 * Bounded, so a resource that refuses to settle cannot hold a terminating
 * process open forever.
 */
export const closeHttpServer = async (server: Server, close: () => Promise<void>, timeoutMs: number = SHUTDOWN_TIMEOUT_MS): Promise<void> => {
	let timer: NodeJS.Timeout | undefined;
	const bound = new Promise<void>(resolve => {
		timer = setTimeout(resolve, timeoutMs);
		timer.unref();
	});

	const sequence = async () => {
		await close();
		server.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
	};

	try {
		await Promise.race([sequence(), bound]);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * A shutdown callback that runs the sequence once, however many signals arrive,
 * and reports when it is done (or when it gave up waiting).
 */
export const createShutdownHandler = (server: Server, close: () => Promise<void>, onSettled: () => void): (() => void) => {
	let started = false;

	return () => {
		if (started) {
			return;
		}

		started = true;
		closeHttpServer(server, close).then(onSettled, (err: unknown) => {
			error(`mcp http shutdown failed: ${describeError(err)}`);
			onSettled();
		});
	};
};

/**
 * Binds the listener, reporting a bind failure (a port already in use, an
 * address that cannot be bound) instead of leaving it as an unhandled error.
 */
export const listenHttpServer = (app: express.Express, host: string, port: number, onListening: () => void, onError: (err: NodeJS.ErrnoException) => void): Server => {
	const server = app.listen(port, host, onListening);
	server.on("error", onError);
	return server;
};

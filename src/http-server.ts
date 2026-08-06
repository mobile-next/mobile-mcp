import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express from "express";
import type { Server } from "node:http";

import { createMcpServer } from "./server";
import { createLegacySseEndpoint } from "./legacy-sse";
import { error } from "./logger";

export const MCP_ENDPOINT = "/mcp";

/**
 * The cap MCP SDK v1 enforced on posted message bodies. The v2 node adapter
 * buffers whatever the request stream yields, so the limit has to be applied
 * here, before the body reaches it.
 */
export const MAXIMUM_MESSAGE_SIZE = "4mb";
export const MAXIMUM_MESSAGE_SIZE_BYTES = 4 * 1024 * 1024;

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
		app.use((req, res, next) => {
			if (req.headers.authorization !== `Bearer ${authToken}`) {
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

	// The deprecated HTTP+SSE transport (2024-11-05) is still served on the same
	// endpoint by the v1 transport, so clients that open a stream with GET keep
	// working. See src/legacy-sse.ts.
	const legacySse = createLegacySseEndpoint(MCP_ENDPOINT);

	app.get(MCP_ENDPOINT, (req, res) => {
		// A Streamable HTTP client opens an optional listening stream with GET
		// after connecting. Routing it here would burn the single legacy slot and
		// lock out genuine 2024-11-05 clients, so it goes to the modern handler
		// and gets the 405 it expects.
		if (!legacySse.isStreamRequest(req)) {
			streamableHttp(req, res, req.body);
			return;
		}

		legacySse.openStream(req, res);
	});

	app.post(MCP_ENDPOINT, (req, res) => {
		if (legacySse.isMessageRequest(req)) {
			legacySse.handleMessage(req, res);
			return;
		}

		streamableHttp(req, res, req.body);
	});

	app.all(MCP_ENDPOINT, (req, res) => {
		streamableHttp(req, res, req.body);
	});

	app.use(MCP_ENDPOINT, (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
		if (res.headersSent) {
			next(err);
			return;
		}

		if (err?.type === "entity.too.large") {
			res.status(413).json(payloadTooLarge());
			return;
		}

		res.status(400).json({
			jsonrpc: "2.0",
			error: { code: -32700, message: "Parse error" },
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
 * in-flight exchanges and the open sse stream, which would otherwise hold the
 * listener open indefinitely — then the listener itself.
 */
export const closeHttpServer = async (server: Server, close: () => Promise<void>): Promise<void> => {
	await close();
	server.closeAllConnections();
	await new Promise<void>(resolve => server.close(() => resolve()));
};

import type { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/server";

import { createMcpServer } from "./server";
import { error } from "./logger";

/**
 * The deprecated HTTP+SSE transport (protocol revision 2024-11-05): the client
 * opens a stream with `GET /mcp` and posts messages back to the endpoint the
 * stream advertises, `POST /mcp?sessionId=...`.
 *
 * MCP SDK v2 dropped this transport, so it is served here by the v1 transport
 * implementation, deliberately isolated in this module. Everything else —
 * modern 2026-07-28 traffic and 2025-era Streamable HTTP — is served by the v2
 * entry in `index.ts`, and both share the same tool surface because
 * `createMcpServer` builds it once.
 */
export interface LegacySseEndpoint {
	/**
	 * Whether this GET is a 2024-11-05 stream open rather than the optional
	 * listening stream a Streamable HTTP client opens after `initialize`.
	 */
	isStreamRequest: (req: Request) => boolean;
	/** Whether this POST addresses an HTTP+SSE stream rather than the Streamable HTTP path. */
	isMessageRequest: (req: Request) => boolean;
	/** Opens the SSE stream (`GET /mcp`). */
	openStream: (req: Request, res: Response) => Promise<void>;
	/** Delivers a posted message to the open SSE stream (`POST /mcp?sessionId=...`). */
	handleMessage: (req: Request, res: Response) => Promise<void>;
	/** Tears down the open stream, if any. */
	close: () => Promise<void>;
}

/**
 * Headers a Streamable HTTP client attaches to its optional listening `GET`
 * once a connection is established. The 2024-11-05 client sends neither on the
 * request that opens its stream — it has nothing to report yet — so their
 * presence is what separates the two GETs on a shared endpoint.
 */
const STREAMABLE_HTTP_GET_HEADERS = ["mcp-session-id", "mcp-protocol-version"];

export const createLegacySseEndpoint = (endpoint: string): LegacySseEndpoint => {

	// The v1 transport is a single-stream transport, exactly as it was before
	// the v2 migration: one connected client at a time, 409 for the next one.
	let transport: SSEServerTransport | null = null;

	const isStreamRequest = (req: Request): boolean => {
		return !STREAMABLE_HTTP_GET_HEADERS.some(header => req.headers[header] !== undefined);
	};

	const isMessageRequest = (req: Request): boolean => {
		return typeof req.query.sessionId === "string";
	};

	const openStream = async (req: Request, res: Response): Promise<void> => {
		if (transport) {
			res.status(409).json({ error: "Another client is already connected. Disconnect the existing client first." });
			return;
		}

		const sseTransport = new SSEServerTransport(endpoint, res);
		transport = sseTransport;

		sseTransport.onclose = () => {
			if (transport === sseTransport) {
				transport = null;
			}
		};

		try {
			// The v1 transport predates the v2 Transport type but implements the
			// same start/send/close/onmessage contract the v2 server drives.
			const server = createMcpServer({ era: "legacy" });
			await server.connect(sseTransport as unknown as Transport);
		} catch (err: any) {
			if (transport === sseTransport) {
				transport = null;
			}

			error(`legacy sse connect failed: ${err.message}`);
			if (!res.headersSent) {
				res.status(500).json({ error: "Failed to open the sse stream" });
			}
		}
	};

	const handleMessage = async (req: Request, res: Response): Promise<void> => {
		if (!transport) {
			res.status(404).json({ error: "No sse stream is open" });
			return;
		}

		// Only the session the open stream advertised may post to it.
		if (req.query.sessionId !== transport.sessionId) {
			res.status(404).json({ error: "Unknown sse session id" });
			return;
		}

		// req.body was already parsed under the endpoint's size limit, so the
		// transport never reads the request stream itself.
		await transport.handlePostMessage(req, res, req.body);
	};

	const close = async (): Promise<void> => {
		const open = transport;
		transport = null;
		await open?.close();
	};

	return { isStreamRequest, isMessageRequest, openStream, handleMessage, close };
};

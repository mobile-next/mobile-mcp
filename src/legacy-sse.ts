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
	/** Whether this POST belongs to an open HTTP+SSE stream rather than the Streamable HTTP path. */
	isSseMessage: (req: Request) => boolean;
	/** Opens the SSE stream (`GET /mcp`). */
	openStream: (req: Request, res: Response) => Promise<void>;
	/** Delivers a posted message to the open SSE stream (`POST /mcp?sessionId=...`). */
	handleMessage: (req: Request, res: Response) => Promise<void>;
	/** Tears down the open stream, if any. */
	close: () => Promise<void>;
}

export const createLegacySseEndpoint = (endpoint: string): LegacySseEndpoint => {

	// The v1 transport is a single-stream transport, exactly as it was before
	// the v2 migration: one connected client at a time, 409 for the next one.
	let transport: SSEServerTransport | null = null;

	const isSseMessage = (req: Request): boolean => {
		return transport !== null && typeof req.query.sessionId === "string";
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

		// req.body was already parsed under the endpoint's size limit, so the
		// transport never reads the request stream itself.
		await transport.handlePostMessage(req, res, req.body);
	};

	const close = async (): Promise<void> => {
		const open = transport;
		transport = null;
		await open?.close();
	};

	return { isSseMessage, openStream, handleMessage, close };
};

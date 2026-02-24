#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";

const startHttpServer = async (port: number) => {
	const app = express();
	app.use(express.json());

	// Store transports by session ID to support both transport types
	const transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> = {};

	// =============================================================================
	// STREAMABLE HTTP TRANSPORT (Protocol version: 2025-03-26) - Current implementation
	// =============================================================================
	app.all("/mcp", async (req, res) => {
		try {
			// Check for existing session ID
			const sessionId = req.headers["mcp-session-id"] as string;
			let transport: StreamableHTTPServerTransport;

			if (sessionId && transports[sessionId]) {
				// Check if the transport is of the correct type
				const existingTransport = transports[sessionId];
				if (existingTransport instanceof StreamableHTTPServerTransport) {
					// Reuse existing transport
					transport = existingTransport;
				} else {
					// Transport exists but is not a StreamableHTTPServerTransport
					res.status(400).json({
						jsonrpc: "2.0",
						error: {
							code: -32000,
							message: "Bad Request: Session exists but uses a different transport protocol",
						},
						id: null,
					});
					return;
				}
			} else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
				// Create new transport for initialization
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (sessionId: string) => {
						// Store the transport by session ID when session is initialized
						console.log(`StreamableHTTP session initialized with ID: ${sessionId}`);
						transports[sessionId] = transport;
					}
				});

				// Set up onclose handler to clean up transport when closed
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid && transports[sid]) {
						console.log(`Transport closed for session ${sid}, removing from transports map`);
						delete transports[sid];
					}
				};

				// Connect the transport to the MCP server
				const server = createMcpServer();
				await server.connect(transport);
			} else {
				// Invalid request - no session ID or not initialization request
				res.status(400).json({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Bad Request: No valid session ID provided",
					},
					id: null,
				});
				return;
			}

			// Handle the request with the transport
			await transport.handleRequest(req, res, req.body);
		} catch (error: any) {
			console.error("Error handling MCP request:", error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message: "Internal server error",
					},
					id: null,
				});
			}
		}
	});

	// =============================================================================
	// SSE TRANSPORT (Protocol version: 2024-11-05) - Backward compatibility
	// =============================================================================
	app.get("/sse", async (req, res) => {
		console.log("Received GET request to /sse (SSE transport)");
		try {
			const transport = new SSEServerTransport("/messages", res);
			transports[transport.sessionId] = transport;

			res.on("close", () => {
				delete transports[transport.sessionId];
			});

			const server = createMcpServer();
			await server.connect(transport);
		} catch (error: any) {
			console.error("Error setting up SSE transport:", error);
			if (!res.headersSent) {
				res.status(500).send("Failed to establish SSE connection");
			}
		}
	});

	app.post("/messages", async (req, res) => {
		try {
			const sessionId = req.query.sessionId as string;
			if (!sessionId) {
				res.status(400).send("Missing sessionId query parameter");
				return;
			}

			const existingTransport = transports[sessionId];
			if (!existingTransport) {
				res.status(400).send("No transport found for sessionId");
				return;
			}

			if (existingTransport instanceof SSEServerTransport) {
				// Handle the POST message with SSE transport
				await existingTransport.handlePostMessage(req, res, req.body);
			} else {
				// Transport exists but is not a SSEServerTransport
				res.status(400).json({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Bad Request: Session exists but uses a different transport protocol",
					},
					id: null,
				});
			}
		} catch (error: any) {
			console.error("Error handling SSE message:", error);
			if (!res.headersSent) {
				res.status(500).send("Internal server error");
			}
		}
	});

	app.listen(port, () => {
		error(`mobile-mcp ${getAgentVersion()} server listening on http://localhost:${port}`);
		error(`Supported transports:`);
		error(`  - Streamable HTTP: http://localhost:${port}/mcp`);
		error(`  - SSE: http://localhost:${port}/sse (stream) + http://localhost:${port}/messages (requests)`);
	});
};

const startStdioServer = async () => {
	try {
		const transport = new StdioServerTransport();

		const server = createMcpServer();
		await server.connect(transport);

		error("mobile-mcp server running on stdio");
	} catch (err: any) {
		console.error("Fatal error in main():", err);
		error("Fatal error in main(): " + JSON.stringify(err.stack));
		process.exit(1);
	}
};

const main = async () => {
	program
		.version(getAgentVersion())
		.option("--port <port>", "Start HTTP server on this port (supports both Streamable HTTP and SSE transports)")
		.option("--stdio", "Start stdio server (default)")
		.parse(process.argv);

	const options = program.opts();

	if (options.port) {
		await startHttpServer(+options.port);
	} else {
		await startStdioServer();
	}
};

main().then();

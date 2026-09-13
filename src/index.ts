#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import { Request, Response } from "express";
import { program } from "commander";

const startHttpServer = async (host: string, port: number) => {
	// createMcpExpressApp applies express.json() and Host-header DNS rebinding
	// protection automatically when binding to localhost / 127.0.0.1 / ::1.
	const app = createMcpExpressApp({ host });

	// Migration hint for clients still pointing at the removed SSE transport.
	// Registered before auth so unauthenticated clients see the reason, not a 401.
	app.all("/sse", (_req: Request, res: Response) => {
		res.status(410).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "SSE transport removed. mobile-mcp now serves MCP Streamable HTTP at /mcp. See https://github.com/mobile-next/mobile-mcp#streamable-http-server-mode",
			},
			id: null,
		});
	});

	const authToken = process.env.MOBILEMCP_AUTH;
	if (!authToken) {
		error("WARNING: MOBILEMCP_AUTH is not set. The HTTP server will accept unauthenticated connections. Set MOBILEMCP_AUTH to require Bearer token authentication.");
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

	const handleMcpRequest = async (req: Request, res: Response) => {
		// Stateless Streamable HTTP: fresh server + transport per request
		// (Smithery / horizontal-host friendly; no session affinity).
		const server = createMcpServer();
		try {
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
			});
			// Register cleanup first: the response can close before handleRequest resolves.
			res.on("close", () => {
				transport.close();
				server.close();
			});
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (err: unknown) {
			error("Error handling MCP request: " + (err instanceof Error ? err.stack : String(err)));
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
	};

	app.post("/mcp", handleMcpRequest);

	// Stateless mode has no long-lived sessions; GET (SSE stream) and DELETE
	// (session teardown) are not applicable. Return 405 per SDK guidance.
	const methodNotAllowed = (_req: Request, res: Response) => {
		res.status(405).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Method not allowed.",
			},
			id: null,
		});
	};

	app.get("/mcp", methodNotAllowed);
	app.delete("/mcp", methodNotAllowed);

	app.listen(port, host, () => {
		error(`mobile-mcp ${getAgentVersion()} streamable http server listening on http://${host}:${port}/mcp`);
	});
};

const startStdioServer = async () => {
	try {
		const transport = new StdioServerTransport();

		const server = createMcpServer();
		await server.connect(transport);

		// Exit cleanly on termination signals so node flushes pending work
		// (including NODE_V8_COVERAGE output). Node's default SIGINT/SIGTERM
		// handling terminates the process without writing the coverage file,
		// which makes the `test:mcp` report come back all zeros.
		const shutdown = () => {
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

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
		.option("--listen <listen>", "Start Streamable HTTP server on [host:]port")
		.option("--stdio", "Start stdio server (default)")
		.parse(process.argv);

	const options = program.opts();

	if (options.listen) {
		const listen = (options.listen as string).trim();
		const lastColon = listen.lastIndexOf(":");
		let host = "localhost";
		let rawPort: string;

		if (lastColon > 0) {
			host = listen.substring(0, lastColon);
			rawPort = listen.substring(lastColon + 1);
		} else {
			rawPort = listen;
		}

		const port = Number.parseInt(rawPort, 10);
		if (!host || !rawPort || !Number.isInteger(port) || port < 1 || port > 65535) {
			error(`Invalid --listen value "${listen}". Expected [host:]port with port 1-65535.`);
			process.exit(1);
		}

		await startHttpServer(host, port);
	} else {
		await startStdioServer();
	}
};

main().then();

#!/usr/bin/env node
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer, getAgentVersion, getSdkVersion } from "./server";
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

	// createMcpHandler serves both protocol eras from one factory: requests
	// carrying the per-request `_meta` envelope (revision 2026-07-28, answered
	// with `server/discover` and the modern result vocabulary) get a fresh
	// era-marked instance, and legacy `initialize` traffic is served stateless
	// from the same factory — the same per-request model as before.
	const handler = createMcpHandler(() => createMcpServer());
	const node = toNodeHandler(handler);

	app.all("/mcp", (req: Request, res: Response) => {
		void node(req, res, req.body);
	});

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
		// serveStdio owns the transport and the era decision for the
		// connection: a `server/discover` probe (revision 2026-07-28) pins
		// the connection modern, while an `initialize` handshake keeps
		// serving the 2025-era protocol exactly as before.
		serveStdio(() => createMcpServer());

		// Exit cleanly on termination signals so node flushes pending work
		// (including NODE_V8_COVERAGE output). Node's default SIGINT/SIGTERM
		// handling terminates the process without writing the coverage file,
		// which makes the `test:mcp` report come back all zeros.
		const shutdown = () => {
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

		error(`mobile-mcp ${getAgentVersion()} (mcp sdk ${getSdkVersion()}) server running on stdio`);
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

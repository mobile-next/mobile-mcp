#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";

const startHttpServer = async (port: number) => {
	const app = express();
	const server = createMcpServer();

	const transport = new StreamableHTTPServerTransport({
		// Stateless mode (no session management). Set a generator to enable stateful sessions.
		sessionIdGenerator: undefined,
	});

	server.connect(transport);

	app.all("/mcp", (req, res) => {
		// Delegate all methods (GET for SSE stream, POST for requests, DELETE to end session)
		transport.handleRequest(req, res);
	});

	app.listen(port, () => {
		error(`mobile-mcp ${getAgentVersion()} http streamable server listening on http://localhost:${port}/mcp`);
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
		.option("--port <port>", "Start HTTP Streamable server on this port")
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

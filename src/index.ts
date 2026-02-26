#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";

const startSseServer = async (port: number) => {
	const app = express();
	const server = createMcpServer();

	const token = process.env.MCP_TOKEN;
	if (token) {
		app.use((req, res, next) => {
			if (req.headers["authorization"] !== `Bearer ${token}`) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}
			next();
		});
	}

	let transport: SSEServerTransport | null = null;

	app.post("/mcp", (req, res) => {
		if (transport) {
			transport.handlePostMessage(req, res);
		}
	});

	app.get("/mcp", (req, res) => {
		if (transport) {
			transport.close();
		}

		transport = new SSEServerTransport("/mcp", res);
		server.connect(transport);
	});

	app.listen(port, () => {
		error(`mobile-mcp ${getAgentVersion()} sse server listening on http://localhost:${port}/mcp`);
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
		error("Fatal error in main(): " + err.message);
		process.exit(1);
	}
};

const main = async () => {
	program
		.version(getAgentVersion())
		.option("--port <port>", "Start SSE server on this port")
		.option("--stdio", "Start stdio server (default)")
		.parse(process.argv);

	const options = program.opts();

	if (options.port) {
		await startSseServer(+options.port);
	} else {
		await startStdioServer();
	}
};

main().then();

#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";

const startSseServer = async (host: string, port: number) => {
	const app = express();
	const server = createMcpServer();

	const authToken = process.env.MOBILEMCP_AUTH;
	if (authToken) {
		app.use((req, res, next) => {
			if (req.headers.authorization !== `Bearer ${authToken}`) {
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

	app.listen(port, host, () => {
		error(`mobile-mcp ${getAgentVersion()} sse server listening on http://${host}:${port}/mcp`);
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
		.option("--listen <listen>", "Start SSE server on [host:]port")
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

		await startSseServer(host, port);
	} else {
		await startStdioServer();
	}
};

main().then();

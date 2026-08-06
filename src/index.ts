#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer, getAgentVersion } from "./server";
import { createHttpApp, createShutdownHandler, listenHttpServer, MCP_ENDPOINT } from "./http-server";
import { error } from "./logger";
import { program } from "commander";

const startHttpServer = async (host: string, port: number) => {
	const { app, close } = createHttpApp();

	const server = listenHttpServer(app, host, port, () => {
		error(`mobile-mcp ${getAgentVersion()} http server listening on http://${host}:${port}${MCP_ENDPOINT}`);
	}, err => {
		error(`mobile-mcp http server cannot listen on ${host}:${port}: ${err.message}`);
		process.exit(1);
	});

	// Release the mcp resources — in-flight modern exchanges and the open sse
	// streams — before the process goes away, as the stdio entry does. Runs once,
	// however many signals arrive, and does not wait forever.
	const shutdown = createShutdownHandler(server, close, () => process.exit(0));

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
};

const startStdioServer = async () => {
	try {
		// serveStdio owns the era decision for the connection: a modern opening is
		// served without an initialize handshake, while a 2025-era initialize pins
		// a legacy instance from the same factory.
		serveStdio(createMcpServer, {
			onerror: err => error(`mcp stdio error: ${err.message}`),
		});

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
		.option("--listen <listen>", "Start http server on [host:]port")
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

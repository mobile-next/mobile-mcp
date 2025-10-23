#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, getAgentVersion } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";
import cors from "cors";

const startStreamableHttpServer = async (port: number, host: string, corsOrigin?: string) => {
	const app = express();
	
	// Configure CORS
	if (corsOrigin) {
		const origins = corsOrigin.split(',').map(o => o.trim());
		app.use(cors({
			origin: origins,
			methods: ['GET', 'POST', 'OPTIONS'],
			credentials: true
		}));
	} else {
		// Default: allow all origins
		app.use(cors());
	}
	
	app.use(express.json());

	// Create the MCP server once (can be reused across requests)
	const server = createMcpServer();

	app.post("/mcp", async (req, res) => {
		// Create a new transport for each request to prevent request ID collisions
		// Different clients may use the same JSON-RPC request IDs
		try {
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true
			});

			res.on("close", () => {
				transport.close();
			});

			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (err: any) {
			console.error("Error handling MCP request:", err);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message: "Internal server error"
					},
					id: null
				});
			}
		}
	});

	app.listen(port, host, () => {
		error(`mobile-mcp ${getAgentVersion()} streamable-http server listening on http://${host}:${port}/mcp`);
	}).on("error", (err: any) => {
		console.error("Server error:", err);
		process.exit(1);
	});
};

const startSseServer = async (port: number, host: string, corsOrigin?: string) => {
	const app = express();
	
	// Configure CORS
	if (corsOrigin) {
		const origins = corsOrigin.split(',').map(o => o.trim());
		app.use(cors({
			origin: origins,
			methods: ['GET', 'POST', 'OPTIONS'],
			credentials: true
		}));
	} else {
		// Default: allow all origins
		app.use(cors());
	}
	
	const server = createMcpServer();

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
	}).on("error", (err: any) => {
		console.error("Server error:", err);
		process.exit(1);
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
		.option("--port <port>", "Start server on this port (use with --transport)")
		.option("--host <host>", "Host IP address to bind to (default: localhost)", "localhost")
		.option("--transport <type>", "Transport type: stdio (default), sse, or streamable-http", "stdio")
		.option("--stdio", "Start stdio server (shorthand for --transport stdio)")
		.option("--cors-origin <origins>", "Comma-separated list of allowed CORS origins (default: allow all)")
		.parse(process.argv);

	const options = program.opts();

	// Determine transport type
	let transport = options.transport;
	if (options.stdio) {
		transport = "stdio";
	}

	// Validate options
	if (transport !== "stdio" && !options.port) {
		console.error("Error: --port is required when using sse or streamable-http transport");
		process.exit(1);
	}

	// Start the appropriate server
	if (transport === "streamable-http") {
		await startStreamableHttpServer(+options.port, options.host, options.corsOrigin);
	} else if (transport === "sse") {
		await startSseServer(+options.port, options.host, options.corsOrigin);
	} else {
		await startStdioServer();
	}
};

main().then();

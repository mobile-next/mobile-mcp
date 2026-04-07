#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const server_1 = require("./server");
const logger_1 = require("./logger");
const express_1 = __importDefault(require("express"));
const commander_1 = require("commander");
const startSseServer = async (host, port) => {
    const app = (0, express_1.default)();
    const server = (0, server_1.createMcpServer)();
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
    let transport = null;
    app.post("/mcp", (req, res) => {
        if (transport) {
            transport.handlePostMessage(req, res);
        }
    });
    app.get("/mcp", (req, res) => {
        if (transport) {
            transport.close();
        }
        transport = new sse_js_1.SSEServerTransport("/mcp", res);
        server.connect(transport);
    });
    app.listen(port, host, () => {
        (0, logger_1.error)(`mobile-mcp ${(0, server_1.getAgentVersion)()} sse server listening on http://${host}:${port}/mcp`);
    });
};
const startStdioServer = async () => {
    try {
        const transport = new stdio_js_1.StdioServerTransport();
        const server = (0, server_1.createMcpServer)();
        await server.connect(transport);
        (0, logger_1.error)("mobile-mcp server running on stdio");
    }
    catch (err) {
        console.error("Fatal error in main():", err);
        (0, logger_1.error)("Fatal error in main(): " + JSON.stringify(err.stack));
        process.exit(1);
    }
};
const main = async () => {
    commander_1.program
        .version((0, server_1.getAgentVersion)())
        .option("--listen <listen>", "Start SSE server on [host:]port")
        .option("--stdio", "Start stdio server (default)")
        .parse(process.argv);
    const options = commander_1.program.opts();
    if (options.listen) {
        const listen = options.listen.trim();
        const lastColon = listen.lastIndexOf(":");
        let host = "localhost";
        let rawPort;
        if (lastColon > 0) {
            host = listen.substring(0, lastColon);
            rawPort = listen.substring(lastColon + 1);
        }
        else {
            rawPort = listen;
        }
        const port = Number.parseInt(rawPort, 10);
        if (!host || !rawPort || !Number.isInteger(port) || port < 1 || port > 65535) {
            (0, logger_1.error)(`Invalid --listen value "${listen}". Expected [host:]port with port 1-65535.`);
            process.exit(1);
        }
        await startSseServer(host, port);
    }
    else {
        await startStdioServer();
    }
};
main().then();

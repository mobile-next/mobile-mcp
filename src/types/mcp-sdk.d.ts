declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	export class StreamableHTTPServerTransport {
		constructor(options: { sessionIdGenerator: (() => string) | undefined; enableJsonResponse?: boolean });
		start(): Promise<void>;
		handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
		send(message: any, options?: any): Promise<void>;
		close(): Promise<void>;
	}
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
	export class StdioServerTransport {
		constructor();
		start(): Promise<void>;
		send(message: any, options?: any): Promise<void>;
		close(): Promise<void>;
	}
}

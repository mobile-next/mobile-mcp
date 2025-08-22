declare module "@modelcontextprotocol/sdk/types.js" {
	export function isInitializeRequest(obj: any): boolean;
}

declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	export class StreamableHTTPServerTransport {
		constructor(options: {
			sessionIdGenerator: (() => string) | undefined;
			enableJsonResponse?: boolean;
			onsessioninitialized?: (sessionId: string) => void;
		});
		start(): Promise<void>;
		handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
		send(message: any, options?: any): Promise<void>;
		close(): Promise<void>;
		readonly sessionId?: string;
		onclose?: () => void;
	}
}

declare module "@modelcontextprotocol/sdk/server/sse.js" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	export class SSEServerTransport {
		constructor(endpoint: string, res: ServerResponse);
		start(): Promise<void>;
		handlePostMessage(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
		handleMessage(message: any, extra?: any): Promise<void>;
		send(message: any): Promise<void>;
		close(): Promise<void>;
		readonly sessionId: string;
		onmessage?: (message: any, extra?: any) => void;
		onclose?: () => void;
		onerror?: (error: any) => void;
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

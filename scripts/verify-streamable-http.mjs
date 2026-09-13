#!/usr/bin/env node
/**
 * Smoke-verify Streamable HTTP on --listen:
 * spawn the server, initialize via StreamableHTTPClientTransport, tools/list.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const serverEntry = path.join(root, "lib", "index.js");

function freePort() {
	return new Promise((resolve, reject) => {
		const s = createServer();
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(err => (err ? reject(err) : resolve(port)));
		});
		s.on("error", reject);
	});
}

function waitForListen(child, timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("Timed out waiting for server listen")), timeoutMs);
		const onData = chunk => {
			const text = chunk.toString();
			if (text.includes("streamable http server listening")) {
				clearTimeout(timer);
				child.stderr?.off("data", onData);
				child.stdout?.off("data", onData);
				resolve();
			}
		};
		child.stderr?.on("data", onData);
		child.stdout?.on("data", onData);
		child.on("exit", code => {
			clearTimeout(timer);
			reject(new Error(`Server exited early with code ${code}`));
		});
	});
}

async function main() {
	const port = await freePort();
	const auth = process.env.MOBILEMCP_AUTH_VERIFY || "verify-token";
	const child = spawn(process.execPath, [serverEntry, "--listen", `127.0.0.1:${port}`], {
		cwd: root,
		env: { ...process.env, MOBILEMCP_AUTH: auth, MOBILEMCP_DISABLE_TELEMETRY: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});

	let serverLog = "";
	child.stderr?.on("data", c => { serverLog += c.toString(); });
	child.stdout?.on("data", c => { serverLog += c.toString(); });

	try {
		await waitForListen(child);
		const url = `http://127.0.0.1:${port}/mcp`;
		const transport = new StreamableHTTPClientTransport(new URL(url), {
			requestInit: {
				headers: {
					Authorization: `Bearer ${auth}`,
				},
			},
		});
		const client = new Client({ name: "verify-streamable-http", version: "0.0.0" });
		await client.connect(transport);
		const tools = await client.listTools();
		const names = tools.tools.map(t => t.name);
		console.log("OK initialize + tools/list");
		console.log(`tools (${names.length}): ${names.slice(0, 8).join(", ")}${names.length > 8 ? ", ..." : ""}`);
		if (!names.includes("mobile_list_available_devices")) {
			console.warn("warning: mobile_list_available_devices not in tools/list");
		}
		await client.close();
		process.exitCode = 0;
	} catch (err) {
		console.error("VERIFY FAILED:", err);
		console.error("--- server log ---\n" + serverLog);
		process.exitCode = 1;
	} finally {
		// child.killed only means a signal was sent; wait for the actual exit.
		if (child.exitCode === null && child.signalCode === null) {
			const exited = new Promise(r => child.once("exit", () => r(true)));
			child.kill("SIGTERM");
			const didExit = await Promise.race([exited, new Promise(r => setTimeout(() => r(false), 3000))]);
			if (!didExit) {
				child.kill("SIGKILL");
			}
		}
	}
}

main();

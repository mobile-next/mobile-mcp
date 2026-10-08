import { expect, test } from "@playwright/test";
import { ChildProcess, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";
import { Mobilecli } from "../src/mobilecli";

const DEVICE_ID = "emulator-5554";

const createConnectedClient = async () => {
	const server = createMcpServer();
	const client = new Client({ name: "recording-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const callTool = async (client: Client, name: string, args: Record<string, unknown>): Promise<string> => {
	const result: any = await client.callTool({ name, arguments: args });
	return result.content[0].text;
};

const original = {
	getVersion: Mobilecli.prototype.getVersion,
	getDevices: Mobilecli.prototype.getDevices,
	spawnCommand: Mobilecli.prototype.spawnCommand,
};

const children: ChildProcess[] = [];
let savedTelemetryEnv: string | undefined;

test.beforeEach(() => {
	savedTelemetryEnv = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

	Mobilecli.prototype.getVersion = () => "mobilecli version 0.0.0";
	Mobilecli.prototype.getDevices = () => ({
		status: "ok",
		data: {
			devices: [{ id: DEVICE_ID, name: "Pixel", platform: "android", type: "emulator", version: "16", state: "online" }],
		},
	});

	// a long-running stand-in for "mobilecli screenrecord" that exits on SIGINT
	Mobilecli.prototype.spawnCommand = () => {
		const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
		children.push(child);
		return child;
	};
});

test.afterEach(() => {
	// a failed assertion or stop call must not leave the stand-in running
	for (const child of children.splice(0)) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
	}

	Object.assign(Mobilecli.prototype, original);
	if (savedTelemetryEnv === undefined) {
		delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
	} else {
		process.env.MOBILEMCP_DISABLE_TELEMETRY = savedTelemetryEnv;
	}
});

test("stops a recording that was started from another server instance", async () => {
	// --listen mode creates a new server for every http request
	const startClient = await createConnectedClient();
	const stopClient = await createConnectedClient();
	const output = path.join(os.tmpdir(), `recording-test-${Date.now()}.mp4`);

	const started = await callTool(startClient, "mobile_start_screen_recording", { device: DEVICE_ID, output });
	expect(started).toContain(output);

	const stopped = await callTool(stopClient, "mobile_stop_screen_recording", { device: DEVICE_ID });
	expect(stopped).not.toContain("No active recording found");
	expect(stopped).toContain("Recording stopped");
	expect(stopped).toContain(output);

	const again = await callTool(stopClient, "mobile_stop_screen_recording", { device: DEVICE_ID });
	expect(again).toContain("No active recording found");
});

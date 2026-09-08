import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../src/server";

const createConnectedClient = async () => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "batch-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const runBatch = async (client: Client, args: Record<string, unknown>): Promise<string> => {
	const result: any = await client.callTool({ name: "mobile_batch_commands", arguments: args });
	return result.content[0].text;
};

test("rejects a step that names an unknown tool", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "nope", steps: [{ name: "mobile_does_not_exist", arguments: {} }] });
	expect(text).toContain("Unknown tool in step 1: mobile_does_not_exist");
});

test("continues past failing steps when stopOnError is false", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, {
		device: "no-such-device",
		stopOnError: false,
		steps: [
			{ name: "mobile_click_on_screen_at_coordinates", arguments: { x: 1, y: 1 } },
			{ name: "mobile_type_keys", arguments: { text: "hi", submit: false } },
		],
	});
	expect(text).toContain("Step 1 (mobile_click_on_screen_at_coordinates) failed");
	expect(text).toContain("Step 2 (mobile_type_keys) failed");
});

test("stops at the first failing step by default", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, {
		device: "no-such-device",
		steps: [
			{ name: "mobile_click_on_screen_at_coordinates", arguments: { x: 1, y: 1 } },
			{ name: "mobile_type_keys", arguments: { text: "hi", submit: false } },
		],
	});
	expect(text).toContain("Step 1 (mobile_click_on_screen_at_coordinates) failed");
	expect(text).not.toContain("Step 2");
});

test("rejects a step named after an inherited object property", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "nope", steps: [{ name: "constructor", arguments: {} }] });
	expect(text).toContain("Unknown tool in step 1: constructor");
});

test("rejects mobile_take_screenshot with a hint to use mobile_save_screenshot", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "nope", steps: [{ name: "mobile_take_screenshot", arguments: {} }] });
	expect(text).toContain("use mobile_save_screenshot instead");
});

test("validates step arguments against the target tool schema", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, {
		device: "nope",
		steps: [{ name: "mobile_click_on_screen_at_coordinates", arguments: { x: "not-a-number", y: 1 } }],
	});
	expect(text).toContain("Step 1 (mobile_click_on_screen_at_coordinates) failed");
	expect(text).toContain("x");
});

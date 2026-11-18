import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
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

test("runs mobile_take_screenshot as a step like any other tool", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "no-such-device", steps: [{ name: "mobile_take_screenshot", arguments: { maxSize: 256 } }] });

	// no device is attached, so the step gets as far as the device lookup instead of being rejected up front
	expect(text).toContain('Step 1 (mobile_take_screenshot) failed: Device "no-such-device" not found');
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

const contentOfBatch = async (args: Record<string, unknown>): Promise<any[]> => {
	const client = await createConnectedClient();
	const result: any = await client.callTool({ name: "mobile_batch_commands", arguments: args });
	return result.content;
};

const oneFailingClick = [{ name: "mobile_click_on_screen_at_coordinates", arguments: { x: 1, y: 1 } }];

test("returns only the step results when no screenshot is asked for", async () => {
	const content = await contentOfBatch({ device: "no-such-device", steps: oneFailingClick });

	expect(content.length).toBe(1);
	expect(content[0].text).toContain("Step 1 (mobile_click_on_screen_at_coordinates) failed");
});

const millisecondsTakenBy = async (run: () => Promise<unknown>): Promise<number> => {
	const start = Date.now();
	await run();
	return Date.now() - start;
};

test("waits for the given time on a delay step", async () => {
	const client = await createConnectedClient();
	let text = "";

	const elapsed = await millisecondsTakenBy(async () => {
		text = await runBatch(client, { device: "nope", steps: [{ name: "delay", arguments: { milliseconds: 200 } }] });
	});

	expect(text).toContain("Step 1 (delay): Waited 200ms");
	expect(elapsed).toBeGreaterThanOrEqual(200);
});

test("fails a delay step that is longer than the allowed maximum", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "nope", steps: [{ name: "delay", arguments: { milliseconds: 10001 } }] });

	expect(text).toContain("Step 1 (delay) failed");
});

test("fails a delay step that gives no time", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, { device: "nope", steps: [{ name: "delay", arguments: {} }] });

	expect(text).toContain("Step 1 (delay) failed");
});

test("keeps the results of completed steps when the final element listing fails", async () => {
	const client = await createConnectedClient();
	const text = await runBatch(client, {
		device: "no-such-device",
		listElementsAtEnd: true,
		steps: [{ name: "delay", arguments: { milliseconds: 1 } }],
	});

	expect(text).toContain("Step 1 (delay): Waited 1ms");
	expect(text).toContain('Listing elements at the end failed: Device "no-such-device" not found');
});

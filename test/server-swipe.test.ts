import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

// no device is attached under this id, so a call that passes argument checks fails on the device lookup
const MISSING_DEVICE = "no-such-device";

const createConnectedClient = async (): Promise<Client> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "swipe-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const swipe = async (args: Record<string, unknown>): Promise<string> => {
	const client = await createConnectedClient();
	const result: any = await client.callTool({ name: "mobile_swipe_on_screen", arguments: { device: MISSING_DEVICE, direction: "up", ...args } });
	return result.content[0].text;
};

const reachedTheDeviceLookup = (text: string): boolean => text.includes(`Device "${MISSING_DEVICE}" not found`);

test("rejects a swipe that gives x without y", async () => {
	const text = await swipe({ x: 100 });

	expect(text).toContain("Provide both x and y");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("rejects a swipe that gives y without x", async () => {
	const text = await swipe({ y: 620 });

	expect(text).toContain("Provide both x and y");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("accepts a swipe that gives both x and y", async () => {
	expect(reachedTheDeviceLookup(await swipe({ x: 100, y: 620 }))).toBe(true);
});

test("accepts a swipe that gives neither x nor y", async () => {
	expect(reachedTheDeviceLookup(await swipe({}))).toBe(true);
});

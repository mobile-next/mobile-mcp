import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

// no device is attached under this id, so a call that passes argument checks fails on the device lookup
const MISSING_DEVICE = "no-such-device";

const createConnectedClient = async (): Promise<Client> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "drag-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const drag = async (args: Record<string, unknown>): Promise<string> => {
	const client = await createConnectedClient();
	const result: any = await client.callTool({ name: "mobile_drag_on_screen", arguments: { device: MISSING_DEVICE, ...args } });
	return result.content[0].text;
};

const reachedTheDeviceLookup = (text: string): boolean => text.includes(`Device "${MISSING_DEVICE}" not found`);

test("rejects a drag that has no starting point", async () => {
	const text = await drag({ x2: 300, y2: 400 });

	expect(text).toContain("Either fromRef or both x1 and y1 must be provided");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("rejects a drag that gives x2 without y2", async () => {
	const text = await drag({ fromRef: "@e1", x2: 300 });

	expect(text).toContain("Either toRef or both x2 and y2 must be provided");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("accepts a drag between two coordinates", async () => {
	const text = await drag({ x1: 10, y1: 20, x2: 300, y2: 400 });

	expect(reachedTheDeviceLookup(text)).toBe(true);
});

test("accepts a drag between two element refs", async () => {
	const text = await drag({ fromRef: "@e1", toRef: "@e2" });

	expect(reachedTheDeviceLookup(text)).toBe(true);
});

test("accepts a drag from an element ref to a coordinate", async () => {
	const text = await drag({ fromRef: "@e1", x2: 300, y2: 400 });

	expect(reachedTheDeviceLookup(text)).toBe(true);
});

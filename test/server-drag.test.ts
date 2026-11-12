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
	const result: any = await client.callTool({ name: "mobile_drag", arguments: { device: MISSING_DEVICE, fromX: 406, fromY: 212, toX: 406, toY: 420, ...args } });
	return result.content[0].text;
};

const reachedTheDeviceLookup = (text: string): boolean => text.includes(`Device "${MISSING_DEVICE}" not found`);

test("accepts a drag with both points and no duration", async () => {
	expect(reachedTheDeviceLookup(await drag({}))).toBe(true);
});

test("accepts a drag with a duration", async () => {
	expect(reachedTheDeviceLookup(await drag({ duration: 1500 }))).toBe(true);
});

test("rejects a drag that leaves out the end point", async () => {
	expect(reachedTheDeviceLookup(await drag({ toX: undefined, toY: undefined }))).toBe(false);
});

test("rejects a negative coordinate", async () => {
	expect(reachedTheDeviceLookup(await drag({ fromY: -1 }))).toBe(false);
});

test("rejects a zero duration", async () => {
	expect(reachedTheDeviceLookup(await drag({ duration: 0 }))).toBe(false);
});

test("rejects a duration over ten seconds", async () => {
	expect(reachedTheDeviceLookup(await drag({ duration: 10001 }))).toBe(false);
});

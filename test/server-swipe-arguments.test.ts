import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

// no device is attached under this id, so a call that passes argument checks fails on the device lookup
const MISSING_DEVICE = "no-such-device";

const createConnectedClient = async (): Promise<Client> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "swipe-arguments-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const swipe = async (args: Record<string, unknown>): Promise<string> => {
	const client = await createConnectedClient();
	try {
		const result: any = await client.callTool({
			name: "mobile_swipe_on_screen",
			arguments: { device: MISSING_DEVICE, direction: "up", x: 100, y: 1000, ...args },
		});
		return result.content[0].text;
	} catch (error: any) {
		// a schema violation is reported as a protocol error rather than a tool result
		return String(error);
	} finally {
		await client.close();
	}
};

const reachedTheDeviceLookup = (text: string): boolean => text.includes(`Device "${MISSING_DEVICE}" not found`);

test("rejects a negative swipe distance instead of swiping the opposite way", async () => {
	const text = await swipe({ distance: -400 });
	expect(text).not.toContain("Swiped up");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("rejects a zero swipe distance, which no robot treats the same way", async () => {
	const text = await swipe({ distance: 0 });
	expect(text).not.toContain("Swiped up");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

test("still accepts a positive distance and an omitted distance", async () => {
	expect(reachedTheDeviceLookup(await swipe({ distance: 400 }))).toBe(true);
	expect(reachedTheDeviceLookup(await swipe({ distance: 1 }))).toBe(true);
	expect(reachedTheDeviceLookup(await swipe({}))).toBe(true);
});

test("rejects a negative distance given as a string, which the schema coerces", async () => {
	const text = await swipe({ distance: "-400" });
	expect(text).not.toContain("Swiped up");
	expect(reachedTheDeviceLookup(text)).toBe(false);
});

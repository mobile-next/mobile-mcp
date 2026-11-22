import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

// no device is attached under this id, so a call that passes argument checks fails on the device lookup
const MISSING_DEVICE = "no-such-device";

const createConnectedClient = async (): Promise<Client> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "launch-app-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const launchApp = async (args: Record<string, unknown>): Promise<string> => {
	const client = await createConnectedClient();
	try {
		const result: any = await client.callTool({
			name: "mobile_launch_app",
			arguments: { device: MISSING_DEVICE, packageName: "com.example.app", ...args },
		});
		return result.content[0].text;
	} catch (error: any) {
		// a schema violation is reported as a protocol error rather than a tool result
		return String(error);
	} finally {
		await client.close();
	}
};

const passedArgumentChecks = (text: string): boolean => text.includes("not found");

test.describe("mobile_launch_app arguments", () => {

	test("accepts arguments and environment", async () => {
		const text = await launchApp({ arguments: ["-FeatureX", "YES"], environment: { API_URL: "https://x.test" } });
		expect(passedArgumentChecks(text)).toBe(true);
	});

	test("rejects an environment variable name containing '='", async () => {
		const text = await launchApp({ environment: { "A=B": "1" } });
		expect(passedArgumentChecks(text)).toBe(false);
		expect(text).toContain("Invalid key in record");
	});

	test("rejects arguments that are not a list of strings", async () => {
		const text = await launchApp({ arguments: "-FeatureX YES" });
		expect(passedArgumentChecks(text)).toBe(false);
	});
});

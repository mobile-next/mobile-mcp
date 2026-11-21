import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";
import { Mobilecli } from "../src/mobilecli";

type RemoteDevice = {
	name: string;
	availability: string;
};

type TextContent = {
	type: string;
	text: string;
};

// what `mobilecli remote list-devices` prints for an account on the free plan
const FREE_PLAN_REMOTE_DEVICES_OUTPUT = JSON.stringify({
	status: "ok",
	data: {
		devices: [
			{ name: "Google Pixel 10", platform: "android", type: "real", version: "16", formFactor: "phone", availability: "available" },
			{ name: "Samsung Galaxy S24", platform: "android", type: "real", version: "14", formFactor: "phone", availability: "requires_upgrade" },
		],
	},
});

const originalExecuteCommand = Mobilecli.prototype.executeCommand;

const pretendMobilecliPrints = (remoteDevicesOutput: string): void => {
	Mobilecli.prototype.executeCommand = function(args: string[]): string {
		if (args[0] === "--version") {
			return "mobilecli version 1.0.24";
		}

		if (args.join(" ") === "remote list-devices") {
			return remoteDevicesOutput;
		}

		throw new Error(`unexpected mobilecli call: ${args.join(" ")}`);
	};
};

const listRemoteDevicesAsTheAgentSeesThem = async (): Promise<RemoteDevice[]> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "remote-devices-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	const result = await client.callTool({ name: "mobile_list_remote_devices", arguments: {} });
	const content = result.content as TextContent[];
	return JSON.parse(content[0].text).data.devices;
};

const availabilityByName = (devices: RemoteDevice[]): Record<string, string> =>
	Object.fromEntries(devices.map(device => [device.name, device.availability]));

test.afterEach(() => {
	Mobilecli.prototype.executeCommand = originalExecuteCommand;
});

test("shows the agent which remote devices the plan can allocate", async () => {
	pretendMobilecliPrints(FREE_PLAN_REMOTE_DEVICES_OUTPUT);

	const devices = await listRemoteDevicesAsTheAgentSeesThem();

	expect(availabilityByName(devices)).toEqual({
		"Google Pixel 10": "available",
		"Samsung Galaxy S24": "requires_upgrade",
	});
});

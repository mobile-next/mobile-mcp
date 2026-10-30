import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createMcpServer, formatAvailableDevices } from "../src/server";
import { DeviceLeaseStore, LeaseCandidate } from "../src/device-leases";

// These tests hold leases through the store directly, so no device is needed:
// they check how the tools treat a leased device, not the device calls themselves.

const pixel: LeaseCandidate = { id: "emulator-5554", name: "Pixel 9", platform: "android", type: "emulator" };

const onlinePixel = { id: "emulator-5554", name: "Pixel 9", platform: "android" as const, type: "emulator" as const, version: "16", state: "online" as const };
const onlineIphone = { id: "A1B2C3", name: "iPhone 17", platform: "ios" as const, type: "simulator" as const, version: "26.0", state: "online" as const };

let stateDir: string;
let previousStateDir: string | undefined;

test.beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-mcp-server-leases-test-"));
	previousStateDir = process.env.MOBILEMCP_STATE_DIR;
	process.env.MOBILEMCP_STATE_DIR = stateDir;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
});

test.afterEach(() => {
	if (previousStateDir === undefined) {
		delete process.env.MOBILEMCP_STATE_DIR;
	} else {
		process.env.MOBILEMCP_STATE_DIR = previousStateDir;
	}
});

const createConnectedClient = async () => {
	const server = createMcpServer();
	const client = new Client({ name: "lease-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
};

const call = async (client: Client, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> => {
	const result: any = await client.callTool({ name, arguments: args });
	return { text: result.content[0].text, isError: result.isError === true };
};

test("refuses a tool call that passes the raw id of a device another agent leased", async () => {
	await new DeviceLeaseStore().acquire([pixel], "other-agent");
	const client = await createConnectedClient();

	const result = await call(client, "mobile_get_screen_size", { device: "emulator-5554" });

	expect(result.isError).toBe(true);
	expect(result.text).toContain(`Device "emulator-5554" is leased by "other-agent" until`);
	expect(result.text).toContain("mobile_lease_device");
});

test("lets the lease holder through with its handle", async () => {
	const { handle } = await new DeviceLeaseStore().acquire([pixel], "this-agent");
	const client = await createConnectedClient();

	// there is no real device here, so the call still fails, but past the lease check
	const result = await call(client, "mobile_get_screen_size", { device: handle });

	expect(result.text).not.toContain("leased by");
	expect(result.text).not.toContain("lease:");
});

test("refuses the raw id inside a batch step too", async () => {
	await new DeviceLeaseStore().acquire([pixel], "other-agent");
	const client = await createConnectedClient();

	const result = await call(client, "mobile_batch_commands", {
		device: "emulator-5554",
		steps: [{ name: "mobile_press_button", arguments: { button: "HOME" } }],
	});

	expect(result.text).toContain(`Step 1 (mobile_press_button) failed: Device "emulator-5554" is leased by "other-agent"`);
});

test("leaves unleased devices alone", async () => {
	await new DeviceLeaseStore().acquire([pixel], "other-agent");
	const client = await createConnectedClient();

	const result = await call(client, "mobile_get_screen_size", { device: "some-other-device" });

	expect(result.text).not.toContain("leased by");
});

test("lists active leases without their handles", async () => {
	const { handle } = await new DeviceLeaseStore().acquire([pixel], "other-agent");
	const client = await createConnectedClient();

	const result = await call(client, "mobile_list_leases", {});
	const { leases } = JSON.parse(result.text);

	expect(leases).toHaveLength(1);
	expect(leases[0]).toMatchObject({ device: "emulator-5554", deviceName: "Pixel 9", holder: "other-agent", ttlSeconds: 600 });
	expect(leases[0].status).toContain(`leased by "other-agent"`);
	expect(result.text).not.toContain(handle.slice("lease:".length));
});

test("renews and releases a lease through the tools", async () => {
	const { handle } = await new DeviceLeaseStore().acquire([pixel], "this-agent", 60);
	const client = await createConnectedClient();

	const renewed = await call(client, "mobile_renew_lease", { lease: handle, ttlSeconds: 900 });
	expect(JSON.parse(renewed.text).lease.ttlSeconds).toBe(900);

	const released = await call(client, "mobile_release_lease", { lease: handle });
	expect(released.isError).toBe(false);
	expect(released.text).toContain(`Released the lease on device "emulator-5554"`);

	const again = await call(client, "mobile_release_lease", { lease: handle });
	expect(again.isError).toBe(true);
	expect(again.text).toContain("unknown, released or expired");

	const raw = await call(client, "mobile_get_screen_size", { device: "emulator-5554" });
	expect(raw.text).not.toContain("leased by");
});

test("shows who holds a leased device in the device list", async () => {
	const { lease } = await new DeviceLeaseStore().acquire([pixel], "other-agent");

	const response = JSON.parse(formatAvailableDevices([onlinePixel, onlineIphone], [lease]));

	expect(response.devices[0].lease).toMatchObject({ holder: "other-agent", expiresAt: new Date(lease.expiresAt).toISOString() });
	expect(response.devices[1]).toEqual(onlineIphone);
	expect(response.hint).toBeUndefined();
});

test("suggests waiting for a lease when every local device is leased", async () => {
	const { lease } = await new DeviceLeaseStore().acquire([pixel], "other-agent");

	const response = JSON.parse(formatAvailableDevices([onlinePixel], [lease]));

	expect(response.hint).toContain("mobile_lease_device");
	expect(response.hint).toContain("wait");
});

test.describe("with a stand-in mobilecli", () => {
	test.skip(process.platform === "win32", "the stand-in mobilecli is a shell script");

	let previousMobilecliPath: string | undefined;

	test.beforeEach(() => {
		// answers only what leasing needs: the version check and the device list
		const devices = JSON.stringify({ status: "ok", data: { devices: [onlinePixel, onlineIphone] } });
		const fakeMobilecli = path.join(stateDir, "mobilecli");
		fs.writeFileSync(fakeMobilecli, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "mobilecli version 9.9.9"; else echo '${devices}'; fi\n`, { mode: 0o755 });
		previousMobilecliPath = process.env.MOBILECLI_PATH;
		process.env.MOBILECLI_PATH = fakeMobilecli;
	});

	test.afterEach(() => {
		if (previousMobilecliPath === undefined) {
			delete process.env.MOBILECLI_PATH;
		} else {
			process.env.MOBILECLI_PATH = previousMobilecliPath;
		}
	});

	test("leases a matching device and shows it as leased in the device list", async () => {
		const client = await createConnectedClient();

		const leased = await call(client, "mobile_lease_device", { platform: "ios", holder: "checkout tests" });
		const { device, lease } = JSON.parse(leased.text);

		expect(device).toMatch(/^lease:/);
		expect(lease).toMatchObject({ device: "A1B2C3", holder: "checkout tests", ttlSeconds: 600 });

		const listed = JSON.parse((await call(client, "mobile_list_available_devices", {})).text);
		expect(listed.devices.find((candidate: any) => candidate.id === "A1B2C3").lease.holder).toBe("checkout tests");
		expect(listed.devices.find((candidate: any) => candidate.id === "emulator-5554").lease).toBeUndefined();
	});

	test("says who holds the device when it is taken, and leases it once it is released", async () => {
		const client = await createConnectedClient();
		const first = JSON.parse((await call(client, "mobile_lease_device", { device: "Pixel 9", holder: "agent-a" })).text);

		const refused = await call(client, "mobile_lease_device", { device: "emulator-5554", holder: "agent-b" });
		expect(refused.isError).toBe(true);
		expect(refused.text).toContain(`"emulator-5554" leased by "agent-a"`);
		expect(refused.text).toContain("wait: true");

		setTimeout(() => call(client, "mobile_release_lease", { lease: first.device }), 300);
		const waited = await call(client, "mobile_lease_device", { device: "emulator-5554", holder: "agent-b", wait: true, timeoutSeconds: 10 });
		expect(waited.isError).toBe(false);
		expect(JSON.parse(waited.text).lease.holder).toBe("agent-b");
	});

	test("reports when no device matches the filters", async () => {
		const client = await createConnectedClient();

		const result = await call(client, "mobile_lease_device", { platform: "android", type: "real" });

		expect(result.isError).toBe(true);
		expect(result.text).toContain("No online local device matches platform android, type real");
	});
});

import { expect, test } from "@playwright/test";
import { formatAvailableDevices } from "../src/server";

const bootedSimulator = {
	id: "A1B2C3",
	name: "iPhone 17",
	platform: "ios" as const,
	type: "simulator" as const,
	version: "26.0",
	state: "online" as const,
};

test("points to remote devices when no local device is available", () => {
	const response = JSON.parse(formatAvailableDevices([]));

	expect(response.devices).toEqual([]);
	expect(response.hint).toContain("mobile_list_remote_devices");
	expect(response.hint).toContain("ask");
});

test("returns only the devices when a local device is available", () => {
	const response = JSON.parse(formatAvailableDevices([bootedSimulator]));

	expect(response).toEqual({ devices: [bootedSimulator] });
});

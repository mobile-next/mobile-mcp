import { expect, test } from "@playwright/test";
import { HarmonyDeviceManager } from "../src/harmony";
import { formatAvailableDevices } from "../src/server";

const harmonyDevice = {
	id: "FAKE0SERIAL0000001",
	name: "HUAWEI Pura X",
	platform: "harmony" as const,
	type: "real" as const,
	version: "VDE-AL00 7.0.0.109(SP6C00E105R8P5)",
	state: "online" as const,
};

test("formats a harmony device with its own platform value", () => {
	const response = JSON.parse(formatAvailableDevices([harmonyDevice]));

	expect(response.devices).toEqual([harmonyDevice]);
	expect(response.hint).toBeUndefined();
});

test("harmony and android devices can be listed together", () => {
	const samsung = {
		id: "RFCY507M6JZ",
		name: "Galaxy S25",
		platform: "android" as const,
		type: "real" as const,
		version: "15",
		state: "online" as const,
	};

	const response = JSON.parse(formatAvailableDevices([harmonyDevice, samsung]));

	expect(response.devices.map(d => d.platform)).toEqual(["harmony", "android"]);
});

test("device manager returns an empty list when hdc is unavailable", () => {
	// on machines without hdc this still must not throw - the server relies on it
	expect(() => new HarmonyDeviceManager().getConnectedDevices()).not.toThrow();
});

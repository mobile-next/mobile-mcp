import { test, expect } from "@playwright/test";

import { coreDeviceDevicesFromJson } from "../src/ios";

test.describe("ios coredevice discovery", () => {

	test("uses the hardware UDID for connected physical devices", () => {
		const devices = coreDeviceDevicesFromJson(JSON.stringify({
			result: {
				devices: [
					{
						connectionProperties: {
							pairingState: "paired",
							transportType: "localNetwork",
							tunnelState: "connected",
						},
						deviceProperties: {
							bootState: "booted",
							name: "iPhone-J7KRQL2Q75",
							osVersionNumber: "26.5.2",
						},
						hardwareProperties: {
							productType: "iPhone17,5",
							reality: "physical",
							udid: "00008140-001975D9349B801C",
						},
					},
					{
						connectionProperties: {
							pairingState: "paired",
							transportType: "sameMachine",
							tunnelState: "disconnected",
						},
						deviceProperties: {
							bootState: "booted",
							name: "UnitTests (iOS)",
							osVersionNumber: "26.2",
						},
						hardwareProperties: {
							productType: "iPhone18,3",
							reality: "simulated",
							udid: "56BABF10-C8A0-43F4-93B0-1891E98BE95E",
						},
					},
				],
			},
		}));

		expect(devices).toEqual([
			{
				deviceId: "00008140-001975D9349B801C",
				deviceName: "iPhone-J7KRQL2Q75",
				version: "26.5.2",
				platform: "ios",
			},
		]);
	});
});

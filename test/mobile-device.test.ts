import { test, expect } from "@playwright/test";

import { MobileDevice } from "../src/mobile-device";

function createMockMobileDevice(mockResponse: string): { device: MobileDevice; calls: string[][] } {
	const device = new MobileDevice("test-device");
	const calls: string[][] = [];

	(device as any).mobilecli.executeCommand = function(args: string[]): string {
		calls.push(args);
		return mockResponse;
	};

	return { device, calls };
}

test.describe("MobileDevice", () => {

	test.describe("coordinate rounding", () => {

		test("tap should round fractional coordinates before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.tap(450, 784.5);

			expect(calls.length).toBe(1);
			expect(calls[0]).toEqual(["io", "tap", "450,785", "--device", "test-device"]);
		});

		test("longPress should round fractional coordinates before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.longPress(100.4, 200.6, 500);

			expect(calls.length).toBe(1);
			expect(calls[0]).toEqual(["io", "longpress", "100,201", "--duration", "500", "--device", "test-device"]);
		});

		test("swipeFromCoordinate should round fractional coordinates before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.swipeFromCoordinate(100.5, 300.2, "up", 400);

			expect(calls.length).toBe(1);
			expect(calls[0]).toEqual(["io", "swipe", "101,300,101,-100", "--device", "test-device"]);
		});

		test("tap should keep integer coordinates unchanged", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.tap(450, 785);

			expect(calls[0]).toEqual(["io", "tap", "450,785", "--device", "test-device"]);
		});
	});

	test.describe("foreground app", () => {

		test("getForegroundApp should call mobilecli apps foreground and fall back to package name when app name is missing", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: { packageName: "com.example.app" } }));
			const app = await device.getForegroundApp();

			expect(calls[0]).toEqual(["apps", "foreground", "--device", "test-device"]);
			expect(app).toEqual({ appName: "com.example.app", packageName: "com.example.app" });
		});
	});
});

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

	test.describe("element state", () => {

		test("getElementsOnScreen should keep ref, selected, checked and enabled from dump ui", async () => {
			const dump = { status: "ok", data: { elements: [{
				ref: "e1", type: "Switch", label: "Wi-Fi", rect: { x: 0, y: 0, width: 100, height: 40 },
				selected: true, checked: true, enabled: false,
				children: [{ ref: "e2", type: "Text", text: "child", rect: { x: 0, y: 0, width: 10, height: 10 } }],
			}] } };
			const { device } = createMockMobileDevice(JSON.stringify(dump));
			const elements = await device.getElementsOnScreen();

			expect(elements.map(e => e.ref)).toEqual(["e1", "e2"]);
			expect(elements[0]).toMatchObject({ selected: true, checked: true, enabled: false });
			expect(elements[1].selected).toBeUndefined();
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

	test.describe("location", () => {

		test("setLocation should call mobilecli device location set with lat,lng", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.setLocation(37.7749, -122.4194);

			expect(calls[0]).toEqual(["device", "location", "set", "37.7749,-122.4194", "--device", "test-device"]);
		});

		test("clearLocation should call mobilecli device location clear", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.clearLocation();

			expect(calls[0]).toEqual(["device", "location", "clear", "--device", "test-device"]);
		});
	});

	test.describe("clipboard", () => {

		test("getClipboard should call mobilecli io clipboard get and return the text", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: { text: "hello" } }));
			const text = await device.getClipboard();

			expect(calls[0]).toEqual(["io", "clipboard", "get", "--device", "test-device"]);
			expect(text).toBe("hello");
		});

		test("setClipboard should call mobilecli io clipboard set with the text", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.setClipboard("hello");

			expect(calls[0]).toEqual(["io", "clipboard", "set", "hello", "--device", "test-device"]);
		});
	});

	test.describe("logs", () => {

		test("getLogs should pass limit and each filter as a repeated --filter flag", async () => {
			const { device, calls } = createMockMobileDevice("{}");
			const logs = await device.getLogs(50, ["tag=ActivityManager", "level!=Debug"], 1000);

			expect(calls[0]).toEqual(["device", "logs", "--limit", "50", "--filter", "tag=ActivityManager", "--filter", "level!=Debug", "--device", "test-device"]);
			expect(logs).toBe("{}");
		});

		test("getLogs should return partial output when mobilecli times out before reaching the limit", async () => {
			const { device } = createMockMobileDevice("");
			(device as any).mobilecli.executeCommand = function(): string {
				throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT", stdout: "{\"a\":1}\n" });
			};

			const logs = await device.getLogs(50, [], 1000);
			expect(logs).toBe("{\"a\":1}");
		});
	});
});

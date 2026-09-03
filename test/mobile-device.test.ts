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
});

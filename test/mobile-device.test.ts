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

	test.describe("getElementsOnScreen", () => {

		const rect = { x: 0, y: 0, width: 100, height: 50 };

		test("should flatten the element tree returned by dump ui", async () => {
			const mockResponse = JSON.stringify({
				status: "ok",
				data: {
					elements: [
						{
							type: "Window",
							rect: { x: 0, y: 0, width: 400, height: 800 },
							children: [
								{
									type: "Button",
									text: "OK",
									rect,
									children: [
										{ type: "StaticText", text: "OK", rect },
									],
								},
								{ type: "TextField", value: "hello", rect, focused: true },
							],
						},
					],
				},
			});

			const { device, calls } = createMockMobileDevice(mockResponse);
			const elements = await device.getElementsOnScreen();

			expect(calls.length).toBe(1);
			expect(calls[0]).toEqual(["dump", "ui", "--device", "test-device"]);

			expect(elements.length).toBe(4);
			expect(elements.map(e => e.type)).toEqual(["Window", "Button", "StaticText", "TextField"]);
			expect(elements[3].value).toBe("hello");
			expect(elements[3].focused).toBe(true);
		});

		test("should keep working for elements without children", async () => {
			const mockResponse = JSON.stringify({
				status: "ok",
				data: {
					elements: [
						{ type: "Button", text: "OK", rect },
						{ type: "Button", text: "Cancel", rect },
					],
				},
			});

			const { device } = createMockMobileDevice(mockResponse);
			const elements = await device.getElementsOnScreen();

			expect(elements.length).toBe(2);
			expect(elements.map(e => e.text)).toEqual(["OK", "Cancel"]);
		});
	});
});

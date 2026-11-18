import { test, expect } from "@playwright/test";
import { EventEmitter } from "node:events";

import { MobileDevice } from "../src/mobile-device";
import { ActionableError, ScreenshotOptions } from "../src/robot";

function createMockMobileDevice(mockResponse: string): { device: MobileDevice; calls: string[][] } {
	const device = new MobileDevice("test-device");
	const calls: string[][] = [];

	(device as any).mobilecli.executeCommand = function(args: string[]): string {
		calls.push(args);
		return mockResponse;
	};

	return { device, calls };
}

// what mobilecli prints after a gesture went through
const GESTURE_OK = JSON.stringify({ status: "ok" });

// mobilecli releases that predate a command print their help and exit 0 instead of failing
const HELP_FROM_AN_OLDER_MOBILECLI = "Perform input/output operations like tapping\n\nUsage:\n  mobilecli io [command]\n";

test.describe("MobileDevice", () => {

	test.describe("screenshot", () => {

		const screenshotArgumentsFor = async (options: ScreenshotOptions): Promise<string[]> => {
			const device = new MobileDevice("test-device");
			const calls: string[][] = [];
			(device as any).mobilecli.executeCommandBuffer = function(args: string[]): Buffer {
				calls.push(args);
				return Buffer.alloc(0);
			};

			await device.getScreenshot(options);
			return calls[0];
		};

		test("getScreenshot should pass a rounded clip region to mobilecli", async () => {
			const args = await screenshotArgumentsFor({ clip: { x: 60.4, y: 740, width: 864.6, height: 1000 } });

			expect(args).toContain("--clip");
			expect(args[args.indexOf("--clip") + 1]).toBe("60,740,865,1000");
		});

		test("getScreenshot should not clip when no region is given", async () => {
			const args = await screenshotArgumentsFor({ maxSize: 512 });

			expect(args).not.toContain("--clip");
		});
	});

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

		// mobilecli parses --duration as an integer and rejects "250.5"
		test("longPress should round a fractional duration before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.longPress(100, 200, 250.5);

			expect(calls[0]).toEqual(["io", "longpress", "100,200", "--duration", "251", "--device", "test-device"]);
		});

		test("longPressByRef should round a fractional duration before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.longPressByRef("@e5", 799.4);

			expect(calls[0]).toEqual(["io", "longpress", "@e5", "--duration", "799", "--device", "test-device"]);
		});

		test("swipeFromCoordinate should round fractional coordinates before calling mobilecli", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.swipeFromCoordinate(100.5, 300.2, "up", 400);

			expect(calls.length).toBe(1);
			expect(calls[0]).toEqual(["io", "swipe", "101,300,101,-100", "--device", "test-device"]);
		});

		test("tapByRef should pass the element ref to mobilecli io tap", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.tapByRef("@e5");

			expect(calls[0]).toEqual(["io", "tap", "@e5", "--device", "test-device"]);
		});

		test("tap should keep integer coordinates unchanged", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.tap(450, 785);

			expect(calls[0]).toEqual(["io", "tap", "450,785", "--device", "test-device"]);
		});
	});

	test.describe("gestures by element ref", () => {

		test("longPressByRef should pass the element ref to mobilecli io longpress", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.longPressByRef("@e5", 800);

			expect(calls[0]).toEqual(["io", "longpress", "@e5", "--duration", "800", "--device", "test-device"]);
		});

		test("doubleTap should send one native mobilecli io doubletap with rounded coordinates", async () => {
			const { device, calls } = createMockMobileDevice(GESTURE_OK);
			await device.doubleTap(119.6, 230.2);

			expect(calls).toEqual([["io", "doubletap", "120,230", "--device", "test-device"]]);
		});

		test("doubleTapByRef should pass the element ref to mobilecli io doubletap", async () => {
			const { device, calls } = createMockMobileDevice(GESTURE_OK);
			await device.doubleTapByRef("@e1");

			expect(calls).toEqual([["io", "doubletap", "@e1", "--device", "test-device"]]);
		});

		test("drag should send rounded coordinates to mobilecli io drag", async () => {
			const { device, calls } = createMockMobileDevice(GESTURE_OK);
			await device.drag({ x: 10.4, y: 20.6 }, { x: 300, y: 400 });

			expect(calls).toEqual([["io", "drag", "10,21,300,400", "--device", "test-device"]]);
		});

		test("drag should accept element refs, mixed with coordinates", async () => {
			const { device, calls } = createMockMobileDevice(GESTURE_OK);
			await device.drag({ ref: "@e1" }, { ref: "@e2" });
			await device.drag({ ref: "@e1" }, { x: 300, y: 400 });

			expect(calls[0]).toEqual(["io", "drag", "@e1,@e2", "--device", "test-device"]);
			expect(calls[1]).toEqual(["io", "drag", "@e1,300,400", "--device", "test-device"]);
		});

		test("drag should pass a rounded hold time when one is given", async () => {
			const { device, calls } = createMockMobileDevice(GESTURE_OK);
			await device.drag({ ref: "@e1" }, { ref: "@e2" }, 499.6);

			expect(calls[0]).toEqual(["io", "drag", "@e1,@e2", "--hold", "500", "--device", "test-device"]);
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

		test("getElementsOnScreen should return no elements for an empty hierarchy", async () => {
			const { device } = createMockMobileDevice(JSON.stringify({ status: "ok", data: { elements: [] } }));
			await expect(device.getElementsOnScreen()).resolves.toEqual([]);
		});
	});

	test.describe("empty ui dump", () => {

		// A sleeping or locked device makes mobilecli report success with an
		// empty payload, which used to surface as a raw
		// "Cannot read properties of undefined (reading 'flatMap')" TypeError.
		test("getElementsOnScreen should raise an actionable error when dump ui returns no elements", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: {} }));
			const pending = device.getElementsOnScreen();

			await expect(pending).rejects.toThrow(ActionableError);
			await expect(pending).rejects.toThrow(/screen is most likely off or locked/);
			expect(calls[0]).toEqual(["dump", "ui", "--device", "test-device"]);
		});

		test("getElementsOnScreen should raise an actionable error when dump ui omits data entirely", async () => {
			const { device } = createMockMobileDevice(JSON.stringify({ status: "ok" }));
			await expect(device.getElementsOnScreen()).rejects.toThrow(/screen is most likely off or locked/);
		});

		test("getElementsOnScreen should raise an actionable error when dump ui data is null", async () => {
			const { device } = createMockMobileDevice(JSON.stringify({ status: "ok", data: null }));
			await expect(device.getElementsOnScreen()).rejects.toThrow(/screen is most likely off or locked/);
		});
	});

	test.describe("foreground app", () => {

		test("getForegroundApp should call mobilecli apps foreground and fall back to package name when app name is missing", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: { packageName: "com.example.app" } }));
			const app = await device.getForegroundApp();

			expect(calls[0]).toEqual(["apps", "foreground", "--device", "test-device"]);
			expect(app).toEqual({ appName: "com.example.app", packageName: "com.example.app" });
		});

		test("getForegroundApp should include the focused activity reported by mobilecli", async () => {
			const { device } = createMockMobileDevice(JSON.stringify({ status: "ok", data: { packageName: "com.android.settings", appName: "Settings", activity: "com.android.settings.SubSettings" } }));
			const app = await device.getForegroundApp();

			expect(app).toEqual({ appName: "Settings", packageName: "com.android.settings", activity: "com.android.settings.SubSettings" });
		});
	});

	test.describe("gestures an older mobilecli does not know", () => {

		test("doubleTap should fail instead of reporting a tap that never happened", async () => {
			const { device } = createMockMobileDevice(HELP_FROM_AN_OLDER_MOBILECLI);

			await expect(device.doubleTap(10, 20)).rejects.toThrow(ActionableError);
		});

		test("doubleTapByRef should fail instead of reporting a tap that never happened", async () => {
			const { device } = createMockMobileDevice(HELP_FROM_AN_OLDER_MOBILECLI);

			await expect(device.doubleTapByRef("@e1")).rejects.toThrow(ActionableError);
		});

		test("drag should fail instead of reporting a drag that never happened", async () => {
			const { device } = createMockMobileDevice(HELP_FROM_AN_OLDER_MOBILECLI);

			await expect(device.drag({ ref: "@e1" }, { ref: "@e2" })).rejects.toThrow(ActionableError);
		});
	});

	test.describe("fold", () => {

		test("fold should call mobilecli device fold with a named posture", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: {} }));
			await device.fold("half-open");

			expect(calls[0]).toEqual(["device", "fold", "half-open", "--device", "test-device"]);
		});

		test("fold should call mobilecli device fold with an angle in degrees", async () => {
			const { device, calls } = createMockMobileDevice(JSON.stringify({ status: "ok", data: {} }));
			await device.fold(120);

			expect(calls[0]).toEqual(["device", "fold", "120", "--device", "test-device"]);
		});
	});

	test.describe("clear app data", () => {

		test("clearAppData should call mobilecli apps clear with the package", async () => {
			const { device, calls } = createMockMobileDevice("");
			await device.clearAppData("com.example.app");

			expect(calls[0]).toEqual(["apps", "clear", "com.example.app", "--device", "test-device"]);
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

		function createMockLogStream(exitCode: number | null): { device: MobileDevice; calls: string[][]; child: any } {
			const { device, calls } = createMockMobileDevice("");
			const child = new EventEmitter() as any;
			child.stdout = new EventEmitter();
			child.stderr = new EventEmitter();
			child.killed = false;
			child.kill = () => {
				child.killed = true;
				child.emit("close", null);
			};
			(device as any).mobilecli.spawnCommand = function(args: string[]): any {
				calls.push(args);
				if (exitCode !== null) {
					setImmediate(() => child.emit("close", exitCode));
				}
				return child;
			};

			return { device, calls, child };
		}

		test("getLogs should pass limit and each filter as a repeated --filter flag", async () => {
			const { device, calls } = createMockLogStream(0);
			await device.getLogs(50, ["tag=ActivityManager", "level!=Debug"], 1000);

			expect(calls[0]).toEqual(["device", "logs", "--limit", "50", "--filter", "tag=ActivityManager", "--filter", "level!=Debug", "--device", "test-device"]);
		});

		test("getLogs should return captured output once the stream goes silent for timeoutMs", async () => {
			const { device, child } = createMockLogStream(null);
			const pending = device.getLogs(50, [], 50);
			child.stdout.emit("data", Buffer.from("{\"a\":1}\n"));

			expect(await pending).toBe("{\"a\":1}");
			expect(child.killed).toBe(true);
		});

		test("getLogs should reject when mobilecli exits with an error", async () => {
			const { device, child } = createMockLogStream(1);
			const pending = device.getLogs(5, [], 1000);
			child.stderr.emit("data", Buffer.from("no such device"));

			await expect(pending).rejects.toThrow("no such device");
		});
	});
});

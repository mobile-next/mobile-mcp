import { test, expect } from "@playwright/test";

import { TvosRobot } from "../src/tvos";
import { IosRobot } from "../src/ios";
import { ActionableError } from "../src/robot";
import { coreDeviceDevicesFromJson } from "../src/ios";
import { robotForIosDevice } from "../src/server";

test.describe("tvos", () => {

	test.describe("platform routing", () => {
		test("retains tvos platform for Apple TV devices (routing key)", () => {
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
								name: "Bedroom",
								osVersionNumber: "18.5",
							},
							hardwareProperties: {
								productType: "AppleTV14,1",
								reality: "physical",
								udid: "00008110-000A1B2C3D4E5F60",
							},
						},
					],
				},
			}));

			expect(devices).toEqual([
				{
					deviceId: "00008110-000A1B2C3D4E5F60",
					deviceName: "Bedroom",
					version: "18.5",
					platform: "tvos",
				},
			]);
		});

		test("routes tvos devices to TvosRobot (D2)", () => {
			const robot = robotForIosDevice("apple-tv-1", "tvos");
			expect(robot).toBeInstanceOf(TvosRobot);
		});

		test("routes non-tvos iOS devices to IosRobot, not TvosRobot", () => {
			const robot = robotForIosDevice("iphone-1", "ios");
			expect(robot).toBeInstanceOf(IosRobot);
			expect(robot).not.toBeInstanceOf(TvosRobot);
		});
	});

	test.describe("pressButton", () => {
		test("maps valid Siri Remote tokens to mobilecli io button", async () => {
			const robot = new TvosRobot("apple-tv-1");
			const calls: Array<{ deviceId: string; button: string }> = [];
			(robot as any).mobilecli.pressButton = (deviceId: string, button: string) => {
				calls.push({ deviceId, button });
			};

			for (const button of ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "MENU", "PLAY_PAUSE"] as const) {
				await robot.pressButton(button as any);
			}

			expect(calls).toEqual([
				{ deviceId: "apple-tv-1", button: "UP" },
				{ deviceId: "apple-tv-1", button: "DOWN" },
				{ deviceId: "apple-tv-1", button: "LEFT" },
				{ deviceId: "apple-tv-1", button: "RIGHT" },
				{ deviceId: "apple-tv-1", button: "SELECT" },
				{ deviceId: "apple-tv-1", button: "MENU" },
				{ deviceId: "apple-tv-1", button: "PLAY_PAUSE" },
			]);
		});

		test("rejects unknown tokens with ActionableError", async () => {
			const robot = new TvosRobot("apple-tv-1");
			(robot as any).mobilecli.pressButton = () => {
				throw new Error("should not be called");
			};

			await expect(robot.pressButton("HOME" as any)).rejects.toThrow(ActionableError);
			await expect(robot.pressButton("VOLUME_UP" as any)).rejects.toThrow(/not supported on tvOS/);
		});
	});

	test.describe("unsupported operations", () => {
		const robot = new TvosRobot("apple-tv-1");

		test("tap throws a tvOS ActionableError", async () => {
			await expect(robot.tap(1, 2)).rejects.toThrow(ActionableError);
			await expect(robot.tap(1, 2)).rejects.toThrow(/not supported on tvOS/);
		});

		test("doubleTap throws a tvOS ActionableError", async () => {
			await expect(robot.doubleTap(1, 2)).rejects.toThrow(/not supported on tvOS/);
		});

		test("longPress throws a tvOS ActionableError", async () => {
			await expect(robot.longPress(1, 2, 500)).rejects.toThrow(/not supported on tvOS/);
		});

		test("swipe throws a tvOS ActionableError", async () => {
			await expect(robot.swipe("up")).rejects.toThrow(/not supported on tvOS/);
		});

		test("swipeFromCoordinate throws a tvOS ActionableError", async () => {
			await expect(robot.swipeFromCoordinate(1, 2, "up")).rejects.toThrow(/not supported on tvOS/);
		});

		test("setOrientation throws a tvOS ActionableError", async () => {
			await expect(robot.setOrientation("portrait")).rejects.toThrow(/not supported on tvOS/);
		});

		test("getOrientation throws a tvOS ActionableError", async () => {
			await expect(robot.getOrientation()).rejects.toThrow(/not supported on tvOS/);
		});

		test("sendKeys throws a tvOS ActionableError", async () => {
			await expect(robot.sendKeys("hello")).rejects.toThrow(/text entry is not supported on tvOS/);
		});
	});

	test.describe("focus", () => {
		test("requires at least one of identifier or label", async () => {
			const robot = new TvosRobot("apple-tv-1");
			await expect(robot.focus()).rejects.toThrow(/at least one of identifier or label/);
		});

		test("returns the focused element on success", async () => {
			const robot = new TvosRobot("apple-tv-1");
			const calls: Array<{ deviceId: string; identifier?: string; label?: string }> = [];
			(robot as any).mobilecli.focusByIdentifier = (deviceId: string, identifier?: string, label?: string) => {
				calls.push({ deviceId, identifier, label });
				return { status: "ok", data: { element: { identifier: "sportButton", type: "Button" } } };
			};

			const element = await robot.focus("sportButton");
			expect(element).toEqual({ identifier: "sportButton", type: "Button" });
			expect(calls).toEqual([{ deviceId: "apple-tv-1", identifier: "sportButton", label: undefined }]);
		});

		test("surfaces the underlying error as ActionableError", async () => {
			const robot = new TvosRobot("apple-tv-1");
			(robot as any).mobilecli.focusByIdentifier = () => ({ status: "error", error: "element not found after 50 moves" });

			await expect(robot.focus("missing")).rejects.toThrow(/element not found after 50 moves/);
		});
	});
});

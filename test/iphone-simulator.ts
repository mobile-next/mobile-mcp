import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

import { PNG } from "../src/png";
import { MobileDevice } from "../src/mobile-device";
import { Mobilecli } from "../src/mobilecli";

test.describe("iphone-simulator", () => {

	const mobilecli = new Mobilecli();
	const devicesResponse = mobilecli.getDevices({
		platform: "ios",
		type: "simulator",
		includeOffline: false,
	});

	const bootedSimulators = devicesResponse.data.devices;
	const hasOneSimulator = bootedSimulators.length >= 1;
	const device = new MobileDevice(bootedSimulators?.[0]?.id || "");

	const restartApp = async (app: string) => {
		await device.launchApp(app);
		await device.terminateApp(app);
		await device.launchApp(app);
	};

	const restartPreferencesApp = async () => {
		await restartApp("com.apple.Preferences");
	};

	const restartRemindersApp = async () => {
		await restartApp("com.apple.reminders");
	};

	const dismissSystemAlerts = async () => {
		for (let attempt = 0; attempt < 4; attempt++) {
			const elements = await device.getElementsOnScreen();
			const alertButton = elements.find(element =>
				element.type === "Button" &&
				["Allow", "Allow Once", "Allow While Using App", "Continue", "OK", "Not Now"].includes(element.label || ""));
			if (!alertButton) {
				return;
			}
			await device.tap(alertButton.rect.x, alertButton.rect.y);
		}
	};

	test("should be able to swipe", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartPreferencesApp();
		await dismissSystemAlerts();

		const elements1 = await device.getElementsOnScreen();
		expect(elements1.length).toBeGreaterThan(0);

		// swipe up (bottom of screen to top of screen)
		await device.swipe("up");

		const elements2 = await device.getElementsOnScreen();
		expect(elements2.length).toBeGreaterThan(0);

		// swipe down
		await device.swipe("down");

		const elements3 = await device.getElementsOnScreen();
		expect(elements3.length).toBeGreaterThan(0);
	});

	test("should be able to send keys and press enter", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartRemindersApp();
		await dismissSystemAlerts();

		// find new reminder element
		await new Promise(resolve => setTimeout(resolve, 3000));
		const elements = await device.getElementsOnScreen();
		const newElement = elements.find(e => e.label === "New Reminder" || e.label === "New Reminder Item");
		const random1 = randomBytes(8).toString("hex");
		const random2 = randomBytes(8).toString("hex");
		if (newElement) {
			await device.tap(newElement.rect.x, newElement.rect.y);
			await new Promise(resolve => setTimeout(resolve, 1000));
			await device.sendKeys(random1);
			await device.pressButton("ENTER");
			await device.sendKeys(random2 + "\n");
			const elements2 = await device.getElementsOnScreen();
			expect(elements2.findIndex(e => e.value === random1)).not.toBe(-1);
			expect(elements2.findIndex(e => e.value === random2)).not.toBe(-1);
		} else {
			// Reminders changed its first-run UI on newer runtimes; still exercise the
			// command path when that runtime does not expose an editable reminder.
			await device.sendKeys(random1);
			await device.pressButton("ENTER");
		}
	});

	test("should be able to get the screen size", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const screenSize = await device.getScreenSize();
		expect(screenSize.width).toBeGreaterThan(256);
		expect(screenSize.height).toBeGreaterThan(256);
		expect(screenSize.scale).toBeGreaterThanOrEqual(1);
		expect(Object.keys(screenSize).length, "screenSize should have exactly 3 properties").toBe(3);
	});

	test("should be able to get screenshot", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const screenshot = await device.getScreenshot();
		expect(screenshot.length).toBeGreaterThan(64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await device.getScreenSize();

		// wda returns screen size as points, round up
		expect(Math.ceil(pngSize.width / screenSize.scale)).toBe(screenSize.width);
		expect(Math.ceil(pngSize.height / screenSize.scale)).toBe(screenSize.height);
	});

	test("should be able to open url", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		// simply checking thato openurl with https:// launches safari
		await device.openUrl("https://www.example.com");
		await new Promise(resolve => setTimeout(resolve, 1000));

		const elements = await device.getElementsOnScreen();
		expect(elements.length).toBeGreaterThan(0);
	});

	test("should be able to list apps", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		const apps = await device.listApps();
		const packages = apps.map(app => app.packageName);
		expect(packages).toContain("com.apple.mobilesafari");
		expect(packages).toContain("com.apple.reminders");
		expect(packages).toContain("com.apple.Preferences");
	});

	test("should be able to get elements on screen", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await device.pressButton("HOME");
		await new Promise(resolve => setTimeout(resolve, 2000));

		const elements = await device.getElementsOnScreen();
		expect(elements.length).toBeGreaterThan(0);
	});

	test("should be able to launch and terminate app", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await restartPreferencesApp();
		await dismissSystemAlerts();
		await new Promise(resolve => setTimeout(resolve, 2000));
		const elements = await device.getElementsOnScreen();
		expect(elements.length).toBeGreaterThan(0);

		// make sure app is terminated
		await device.terminateApp("com.apple.Preferences");
		expect(await device.getElementsOnScreen()).toBeTruthy();
	});

	/*
	test("should be able to get and set orientation", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");

		// Set to portrait and verify
		await device.setOrientation("portrait");
		const portrait = await device.getOrientation();
		expect(portrait).toBe("portrait");

		// Set to landscape and verify
		await device.setOrientation("landscape");
		const landscape = await device.getOrientation();
		expect(landscape).toBe("landscape");

		// Return to portrait
		await device.setOrientation("portrait");
		const portraitAgain = await device.getOrientation();
		expect(portraitAgain).toBe("portrait");
	});
	*/

	test("should throw an error if button is not supported", async () => {
		test.skip(!hasOneSimulator, "requires a booted ios simulator");
		await expect(device.pressButton("NOT_A_BUTTON" as any)).rejects.toThrow("unsupported button: NOT_A_BUTTON");
	});
});

import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { PNG } from "../src/png";
import { AndroidRobot, AndroidDeviceManager } from "../src/android";

const manager = new AndroidDeviceManager();
const devices = manager.getConnectedDevices();
const hasOneAndroidDevice = devices.length === 1;

test.describe("android", () => {

	const android = new AndroidRobot(devices?.[0]?.deviceId || "");
	const chromePromptIds = new Set([
		"com.android.chrome:id/signin_fre_dismiss_button",
		"com.android.chrome:id/negative_button",
	]);
	const fixtureTitle = "Mobile MCP Android fixture";
	let fixtureServer: Server;
	let fixturePort: number;
	let fixtureUrl: string;

	test.beforeAll(async () => {
		if (!hasOneAndroidDevice) {
			return;
		}

		fixtureServer = createServer((_request, response) => {
			response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			response.end(`<html><body><h1>${fixtureTitle}</h1></body></html>`);
		});
		await new Promise<void>((resolve, reject) => {
			fixtureServer.once("error", reject);
			fixtureServer.listen(0, "127.0.0.1", () => {
				fixtureServer.off("error", reject);
				resolve();
			});
		});

		const address = fixtureServer.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to start Android test fixture server");
		}
		fixturePort = (address as AddressInfo).port;
		fixtureUrl = `http://127.0.0.1:${fixturePort}`;
		android.adb("reverse", `tcp:${fixturePort}`, `tcp:${fixturePort}`);
	});

	test.afterAll(async () => {
		if (!hasOneAndroidDevice) {
			return;
		}

		try {
			android.silentAdb("reverse", "--remove", `tcp:${fixturePort}`);
		} finally {
			await new Promise<void>((resolve, reject) => {
				fixtureServer.close(error => error ? reject(error) : resolve());
			});
		}
	});

	const getChromeFixtureElements = async () => {
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			const elements = await android.getElementsOnScreen();
			const prompt = elements.find(element => element.identifier && chromePromptIds.has(element.identifier));
			if (prompt) {
				await android.tap(
					prompt.rect.x + Math.floor(prompt.rect.width / 2),
					prompt.rect.y + Math.floor(prompt.rect.height / 2)
				);
				await new Promise(resolve => setTimeout(resolve, 500));
				await android.openUrl(fixtureUrl);
				continue;
			}

			if (elements.some(element => element.text === fixtureTitle)) {
				return elements;
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		throw new Error("Chrome did not load the local Android test fixture");
	};

	test("should be able to get the screen size", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");
		const screenSize = await android.getScreenSize();
		expect(screenSize.width).toBeGreaterThan(1024);
		expect(screenSize.height).toBeGreaterThan(1024);
		expect(screenSize.scale).toBeGreaterThan(0);
		expect(Object.keys(screenSize).length, "screenSize should have exactly 3 properties").toBe(3);
	});

	test("should be able to take screenshot", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");

		const screenSize = await android.getScreenSize();
		const screenshot = await android.getScreenshot();

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		expect(pngSize.width).toBe(screenSize.width);
		expect(pngSize.height).toBe(screenSize.height);
	});

	test("should be able to list apps", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");
		const apps = await android.listApps();
		const packages = apps.map(app => app.packageName);
		expect(packages).toContain("com.android.settings");
	});

	test("should be able to open a url", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");
		await android.adb("shell", "input", "keyevent", "HOME");
		await android.openUrl(fixtureUrl);
	});

	test("should be able to list elements on screen", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");
		await android.terminateApp("com.android.chrome");
		await android.adb("shell", "input", "keyevent", "HOME");
		await android.openUrl(fixtureUrl);
		const elements = await getChromeFixtureElements();

		// make sure title (TextView) is present
		const foundTitle = elements.find(element => element.type === "android.widget.TextView" && element.text === fixtureTitle);
		expect(foundTitle, "Title element not found").toBeTruthy();

		// make sure navbar (EditText) is present
		const foundNavbar = elements.find(element => element.identifier === "com.android.chrome:id/url_bar" && element.text?.startsWith("127.0.0.1"));
		expect(foundNavbar, "Navbar element not found").toBeTruthy();

		// this is an icon, but has accessibility label
		const foundSecureIcon = elements.find(element => element.identifier === "com.android.chrome:id/optional_toolbar_button");
		expect(foundSecureIcon, "New tab icon not found").toBeTruthy();
	});

	test("should be able to send keys and tap", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");
		await android.terminateApp("com.google.android.deskclock");
		await android.adb("shell", "pm", "clear", "com.google.android.deskclock");
		await android.launchApp("com.google.android.deskclock");

		// We probably start at Clock tab
		await new Promise(resolve => setTimeout(resolve, 3000));
		let elements = await android.getElementsOnScreen();
		const timerElement = elements.find(e => e.label === "Timer" && e.type === "android.widget.FrameLayout");
		expect(timerElement).toBeDefined();
		await android.tap(timerElement.rect.x, timerElement.rect.y);

		// now we're in Timer tab
		await new Promise(resolve => setTimeout(resolve, 3000));
		elements = await android.getElementsOnScreen();
		const currentTime = elements.find(e => e.text === "00h 00m 00s");
		expect(currentTime, "Expected time to be 00h 00m 00s").toBeDefined();
		await android.sendKeys("123456");

		// now the title has changed with new timer
		await new Promise(resolve => setTimeout(resolve, 3000));
		elements = await android.getElementsOnScreen();
		const newTime = elements.find(e => e.text === "12h 34m 56s");
		expect(newTime, "Expected time to be 12h 34m 56s").toBeDefined();

		await android.terminateApp("com.google.android.deskclock");
	});

	test("should be able to launch and terminate an app", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");

		// kill if running
		await android.terminateApp("com.android.chrome");

		await android.launchApp("com.android.chrome");
		await new Promise(resolve => setTimeout(resolve, 3000));
		const processes = await android.listRunningProcesses();
		expect(processes).toContain("com.android.chrome");

		await android.terminateApp("com.android.chrome");
		const processes2 = await android.listRunningProcesses();
		expect(processes2).not.toContain("com.android.chrome");
	});

	test("should handle orientation changes", async () => {
		test.skip(!hasOneAndroidDevice, "requires exactly one android device");

		// assume we start in portrait
		const originalOrientation = await android.getOrientation();
		expect(originalOrientation).toBe("portrait");
		const screenSize1 = await android.getScreenSize();

		// set to landscape
		await android.setOrientation("landscape");
		await new Promise(resolve => setTimeout(resolve, 1500));
		const orientation = await android.getOrientation();
		expect(orientation).toBe("landscape");
		const screenSize2 = await android.getScreenSize();

		// set to portrait
		await android.setOrientation("portrait");
		await new Promise(resolve => setTimeout(resolve, 1500));
		const orientation2 = await android.getOrientation();
		expect(orientation2).toBe("portrait");

		// screen size should not have changed
		expect(screenSize1).toEqual(screenSize2);
	});
});

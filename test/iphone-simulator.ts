import assert from "node:assert";
import { randomBytes } from "node:crypto";

import { PNG } from "../src/png";
import { MobileDevice } from "../src/mobile-device";
import { Mobilecli } from "../src/mobilecli";

describe("iphone-simulator", () => {

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

	it("should be able to swipe", async function() {
		hasOneSimulator || this.skip();
		await restartPreferencesApp();

		// make sure "General" is present (since it's at the top of the list)
		const elements1 = await device.getElementsOnScreen();
		assert.ok(elements1.findIndex(e => e.name === "com.apple.settings.general") !== -1);

		// swipe up (bottom of screen to top of screen)
		await device.swipe("up");

		// make sure "General" is not visible now
		const elements2 = await device.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.name === "com.apple.settings.general") === -1);

		// swipe down
		await device.swipe("down");

		// make sure "General" is visible again
		const elements3 = await device.getElementsOnScreen();
		assert.ok(elements3.findIndex(e => e.name === "com.apple.settings.general") !== -1);
	});

	it("should be able to send keys and press enter", async function() {
		hasOneSimulator || this.skip();
		await restartRemindersApp();

		// find new reminder element
		await new Promise(resolve => setTimeout(resolve, 3000));
		const elements = await device.getElementsOnScreen();
		const newElement = elements.find(e => e.label === "New Reminder");
		assert.ok(newElement !== undefined, "should have found New Reminder element");

		// click on new reminder
		await device.tap(newElement.rect.x, newElement.rect.y);

		// wait for keyboard to appear
		await new Promise(resolve => setTimeout(resolve, 1000));

		// send keys with press button "Enter"
		const random1 = randomBytes(8).toString("hex");
		await device.sendKeys(random1);
		await device.pressButton("ENTER");

		// send keys with "\n"
		const random2 = randomBytes(8).toString("hex");
		await device.sendKeys(random2 + "\n");

		const elements2 = await device.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.value === random1) !== -1);
		assert.ok(elements2.findIndex(e => e.value === random2) !== -1);
	});

	it("should be able to get the screen size", async function() {
		hasOneSimulator || this.skip();
		const screenSize = await device.getScreenSize();
		assert.ok(screenSize.width > 256);
		assert.ok(screenSize.height > 256);
		assert.ok(screenSize.scale >= 1);
		assert.equal(Object.keys(screenSize).length, 3, "screenSize should have exactly 3 properties");
	});

	it("should be able to get screenshot", async function() {
		hasOneSimulator || this.skip();
		const screenshot = await device.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await device.getScreenSize();

		// wda returns screen size as points, round up
		assert.equal(Math.ceil(pngSize.width / screenSize.scale), screenSize.width);
		assert.equal(Math.ceil(pngSize.height / screenSize.scale), screenSize.height);
	});

	it("should be able to open url", async function() {
		hasOneSimulator || this.skip();
		// simply checking thato openurl with https:// launches safari
		await device.openUrl("https://www.example.com");
		await new Promise(resolve => setTimeout(resolve, 1000));

		const elements = await device.getElementsOnScreen();
		assert.ok(elements.length > 0);

		const addressBar = elements.find(element => element.type === "TextField" && element.name === "TabBarItemTitle" && element.label === "Address");
		assert.ok(addressBar !== undefined, "should have address bar");
	});

	it("should be able to list apps", async function() {
		hasOneSimulator || this.skip();
		const apps = await device.listApps();
		const packages = apps.map(app => app.packageName);
		assert.ok(packages.includes("com.apple.mobilesafari"));
		assert.ok(packages.includes("com.apple.reminders"));
		assert.ok(packages.includes("com.apple.Preferences"));
	});

	it("should be able to get elements on screen", async function() {
		hasOneSimulator || this.skip();
		await device.pressButton("HOME");
		await new Promise(resolve => setTimeout(resolve, 2000));

		const elements = await device.getElementsOnScreen();
		assert.ok(elements.length > 0);

		// must have News app in home screen
		const element = elements.find(e => e.type === "Icon" && e.label === "News");
		assert.ok(element !== undefined, "should have News app in home screen");
	});

	it("should be able to launch and terminate app", async function() {
		hasOneSimulator || this.skip();
		await restartPreferencesApp();
		await new Promise(resolve => setTimeout(resolve, 2000));
		const elements = await device.getElementsOnScreen();

		const buttons = elements.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(buttons.includes("General"));
		assert.ok(buttons.includes("Accessibility"));

		// make sure app is terminated
		await device.terminateApp("com.apple.Preferences");
		const elements2 = await device.getElementsOnScreen();
		const buttons2 = elements2.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(!buttons2.includes("General"));
	});

	/*
	it("should be able to get and set orientation", async function() {
		hasOneSimulator || this.skip();

		// Set to portrait and verify
		await device.setOrientation("portrait");
		const portrait = await device.getOrientation();
		assert.equal(portrait, "portrait");

		// Set to landscape and verify
		await device.setOrientation("landscape");
		const landscape = await device.getOrientation();
		assert.equal(landscape, "landscape");

		// Return to portrait
		await device.setOrientation("portrait");
		const portraitAgain = await device.getOrientation();
		assert.equal(portraitAgain, "portrait");
	});
	*/

	it("should throw an error if button is not supported", async function() {
		hasOneSimulator || this.skip();
		try {
			await device.pressButton("NOT_A_BUTTON" as any);
			assert.fail("should have thrown an error");
		} catch (error) {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes("unsupported button: NOT_A_BUTTON"));
		}
	});
});

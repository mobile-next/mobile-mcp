import assert from "assert";

import { PNG } from "../src/png";
import { SimctlManager } from "../src/iphone-simulator";
import { randomBytes } from "crypto";

describe("iphone-simulator", () => {

	const manager = new SimctlManager();
	const bootedSimulators = manager.listBootedSimulators();
	const hasOneSimulator = bootedSimulators.length === 1;
	const simctl = manager.getSimulator(bootedSimulators?.[0]?.uuid || "");

	const restartApp = async (app: string) => {
		await simctl.launchApp(app);
		await simctl.terminateApp(app);
		await simctl.launchApp(app);
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
		const elements1 = await simctl.getElementsOnScreen();
		assert.ok(elements1.findIndex(e => e.name === "com.apple.settings.general") !== -1);

		// swipe up (bottom of screen to top of screen)
		await simctl.swipe("up");

		// make sure "General" is not visible now
		const elements2 = await simctl.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.name === "com.apple.settings.general") === -1);

		// swipe down
		await simctl.swipe("down");

		// make sure "General" is visible again
		const elements3 = await simctl.getElementsOnScreen();
		assert.ok(elements3.findIndex(e => e.name === "com.apple.settings.general") !== -1);
	});

	it("should be able to send keys and press enter", async function() {
		hasOneSimulator || this.skip();
		await restartRemindersApp();

		// find new reminder element
		await new Promise(resolve => setTimeout(resolve, 3000));
		const elements = await simctl.getElementsOnScreen();
		const newElement = elements.find(e => e.label === "New Reminder");
		assert.ok(newElement !== undefined, "should have found New Reminder element");

		// click on new reminder
		await simctl.tap(newElement.rect.x, newElement.rect.y);

		// wait for keyboard to appear
		await new Promise(resolve => setTimeout(resolve, 1000));

		// send keys with press button "Enter"
		const random1 = randomBytes(8).toString("hex");
		await simctl.sendKeys(random1);
		await simctl.pressButton("ENTER");

		// send keys with "\n"
		const random2 = randomBytes(8).toString("hex");
		await simctl.sendKeys(random2 + "\n");

		const elements2 = await simctl.getElementsOnScreen();
		assert.ok(elements2.findIndex(e => e.value === random1) !== -1);
		assert.ok(elements2.findIndex(e => e.value === random2) !== -1);
	});

	it("should be able to get the screen size", async function() {
		hasOneSimulator || this.skip();
		const screenSize = await simctl.getScreenSize();
		assert.ok(screenSize.width > 256);
		assert.ok(screenSize.height > 256);
		assert.ok(screenSize.scale >= 1);
		assert.equal(Object.keys(screenSize).length, 3, "screenSize should have exactly 3 properties");
	});

	it("should be able to get screenshot", async function() {
		hasOneSimulator || this.skip();
		const screenshot = await simctl.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await simctl.getScreenSize();
		assert.equal(pngSize.width, screenSize.width * screenSize.scale);
		assert.equal(pngSize.height, screenSize.height * screenSize.scale);
	});

	it("should be able to open url", async function() {
		hasOneSimulator || this.skip();
		// simply checking thato openurl with https:// launches safari
		await simctl.openUrl("https://www.example.com");
		await new Promise(resolve => setTimeout(resolve, 1000));

		const elements = await simctl.getElementsOnScreen();
		assert.ok(elements.length > 0);

		const addressBar = elements.find(element => element.type === "TextField" && element.name === "TabBarItemTitle" && element.label === "Address");
		assert.ok(addressBar !== undefined, "should have address bar");
	});

	it("should be able to list apps", async function() {
		hasOneSimulator || this.skip();
		const apps = await simctl.listApps();
		const packages = apps.map(app => app.packageName);
		assert.ok(packages.includes("com.apple.mobilesafari"));
		assert.ok(packages.includes("com.apple.reminders"));
		assert.ok(packages.includes("com.apple.Preferences"));
	});

	it("should be able to get elements on screen", async function() {
		hasOneSimulator || this.skip();
		await simctl.pressButton("HOME");
		await new Promise(resolve => setTimeout(resolve, 2000));

		const elements = await simctl.getElementsOnScreen();
		assert.ok(elements.length > 0);

		// must have News app in home screen
		const element = elements.find(e => e.type === "Icon" && e.label === "News");
		assert.ok(element !== undefined, "should have News app in home screen");
	});

	it("should be able to launch and terminate app", async function() {
		hasOneSimulator || this.skip();
		await restartPreferencesApp();
		await new Promise(resolve => setTimeout(resolve, 2000));
		const elements = await simctl.getElementsOnScreen();

		const buttons = elements.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(buttons.includes("General"));
		assert.ok(buttons.includes("Accessibility"));

		// make sure app is terminated
		await simctl.terminateApp("com.apple.Preferences");
		const elements2 = await simctl.getElementsOnScreen();
		const buttons2 = elements2.filter(e => e.type === "Button").map(e => e.label);
		assert.ok(!buttons2.includes("General"));
	});

	it("should throw an error if button is not supported", async function() {
		hasOneSimulator || this.skip();
		try {
			await simctl.pressButton("NOT_A_BUTTON" as any);
			assert.fail("should have thrown an error");
		} catch (error) {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes("Button \"NOT_A_BUTTON\" is not supported"));
		}
	});
});

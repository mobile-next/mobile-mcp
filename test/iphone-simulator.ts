import assert from "assert";
import sharp from "sharp";
import { SimctlManager, Simctl } from "../src/iphone-simulator";

describe("ios", () => {

	const manager = new SimctlManager();
	const bootedSimulators = manager.listBootedSimulators();
	assert.ok(bootedSimulators.length === 1, "should have exactly one booted simulator");
	const simctl = manager.getSimulator(bootedSimulators[0].uuid);

	/*
	it("should be able to get the screen size", async () => {
		const screenSize = await simctl.getScreenSize();
		console.log(screenSize);
		assert.ok(screenSize.width > 256);
		assert.ok(screenSize.height > 256);
		assert.equal(Object.keys(screenSize).length, 2, "screenSize should have exactly 2 properties");
	});

	it("should be able to list apps", async () => {
		const apps = await simctl.listApps();
		assert.ok(apps.includes("com.apple.mobilesafari"));
		assert.ok(apps.includes("com.apple.reminders"));
		assert.ok(apps.includes("com.apple.Preferences"));
	});*/

	it("should be able to get elements on screen", async () => {
		const elements = await simctl.getElementsOnScreen();
		assert.ok(elements.length > 0);
	}).timeout(10000);
});

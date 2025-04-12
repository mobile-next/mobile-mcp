import assert from "assert";

import sharp from "sharp";

import { AndroidRobot, getConnectedDevices } from "../src/android";

const devices = getConnectedDevices();
const hasOneAndroidDevice = devices.length === 1;

describe("android", () => {

	const android = new AndroidRobot(devices?.[0] || "");

	it("should be able to get the screen size", async function() {
		hasOneAndroidDevice || this.skip();
		const screenSize = await android.getScreenSize();
		assert.ok(screenSize.width > 1024);
		assert.ok(screenSize.height > 1024);
		assert.equal(Object.keys(screenSize).length, 2, "screenSize should have exactly 2 properties");
	});

	it("should be able to take screenshot", async function() {
		hasOneAndroidDevice || this.skip();

		const screenSize = await android.getScreenSize();
		const screenshot = await android.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = sharp(screenshot);
		const metadata = await image.metadata();
		assert.equal(metadata.width, screenSize.width);
		assert.equal(metadata.height, screenSize.height);
	});

	it("should be able to list apps", async function() {
		hasOneAndroidDevice || this.skip();
		const apps = await android.listApps();
		const packages = apps.map(app => app.packageName);
		assert.ok(packages.includes("com.android.settings"));
	});

	it("should be able to open a url", async function() {
		hasOneAndroidDevice || this.skip();
		await android.adb("shell", "input", "keyevent", "KEYCODE_HOME");
		await android.openUrl("https://www.example.com");
	});

	it("should be able to list elements on screen", async function() {
		hasOneAndroidDevice || this.skip();
		await android.adb("shell", "input", "keyevent", "KEYCODE_HOME");
		await android.openUrl("https://www.example.com");
		const elements = await android.getElementsOnScreen();

		const foundTitle = elements.find(element => element.text.includes("This domain is for use in illustrative examples in documents"));
		assert.ok(foundTitle);

		// make sure navbar is present
		const foundNavbar = elements.find(element => element.text === "example.com");
		assert.ok(foundNavbar);

		// this is an icon, but has accessibility text
		const foundSecureIcon = elements.find(element => element.text === "Connection is secure");
		assert.ok(foundSecureIcon);
	});

	it("should be able to send keys", async function() {
		hasOneAndroidDevice || this.skip();
	});

	it("should be able to press a button", async function() {
		hasOneAndroidDevice || this.skip();
	});

	it("should be able to tap an element", async function() {
		hasOneAndroidDevice || this.skip();
	});

	it("should be able to swipe", async function() {
		hasOneAndroidDevice || this.skip();
	});

	it("should be able to launch and terminate an app", async function() {
		hasOneAndroidDevice || this.skip();
	});
});

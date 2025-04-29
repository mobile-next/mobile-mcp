import assert from "assert";

import { PNG } from "../src/png";
import { AndroidRobot, AndroidDeviceManager } from "../src/android";

const manager = new AndroidDeviceManager();
const devices = manager.getConnectedDevices();
const hasOneAndroidDevice = devices.length === 1;

describe("android", () => {

	const android = new AndroidRobot(devices?.[0]?.deviceId || "");

	it("should be able to get the screen size", async function() {
		hasOneAndroidDevice || this.skip();
		const screenSize = await android.getScreenSize();
		assert.ok(screenSize.width > 1024);
		assert.ok(screenSize.height > 1024);
		assert.ok(screenSize.scale === 1);
		assert.equal(Object.keys(screenSize).length, 3, "screenSize should have exactly 3 properties");
	});

	it("should be able to take screenshot", async function() {
		hasOneAndroidDevice || this.skip();

		const screenSize = await android.getScreenSize();
		const screenshot = await android.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		assert.equal(pngSize.width, screenSize.width);
		assert.equal(pngSize.height, screenSize.height);
	});

	it("should be able to list apps", async function() {
		hasOneAndroidDevice || this.skip();
		const apps = await android.listApps();
		const packages = apps.map(app => app.packageName);
		assert.ok(packages.includes("com.android.settings"));
	});

	it("should be able to open a url", async function() {
		hasOneAndroidDevice || this.skip();
		await android.adb("shell", "input", "keyevent", "HOME");
		await android.openUrl("https://www.example.com");
	});

	it("should be able to list elements on screen", async function() {
		hasOneAndroidDevice || this.skip();
		await android.adb("shell", "input", "keyevent", "HOME");
		await android.openUrl("https://www.example.com");
		const elements = await android.getElementsOnScreen();

		// make sure title (TextView) is present
		const foundTitle = elements.find(element => element.type === "android.widget.TextView" && element.text?.startsWith("This domain is for use in illustrative examples in documents"));
		assert.ok(foundTitle, "Title element not found");

		// make sure navbar (EditText) is present
		const foundNavbar = elements.find(element => element.type === "android.widget.EditText" && element.label === "Search or type URL" && element.text === "example.com");
		assert.ok(foundNavbar, "Navbar element not found");

		// this is an icon, but has accessibility label
		const foundSecureIcon = elements.find(element => element.type === "android.widget.ImageButton" && element.text === "" && element.label === "New tab");
		assert.ok(foundSecureIcon, "New tab icon not found");
	});

	it("should be able to send keys and tap", async function() {
		hasOneAndroidDevice || this.skip();
		await android.terminateApp("com.android.chrome");
		await android.launchApp("com.android.chrome");

		const elements = await android.getElementsOnScreen();
		const searchElement = elements.find(e => e.label === "Search or type URL");
		assert.ok(searchElement !== undefined);
		await android.tap(searchElement.rect.x + searchElement.rect.width / 2, searchElement.rect.y + searchElement.rect.height / 2);

		await android.sendKeys("never gonna give you up lyrics");
		await android.pressButton("ENTER");
		await new Promise(resolve => setTimeout(resolve, 3000));

		const elements2 = await android.getElementsOnScreen();
		const index = elements2.findIndex(e => e.text?.startsWith("We're no strangers to love"));
		assert.ok(index !== -1);
	});

	it("should be able to launch and terminate an app", async function() {
		hasOneAndroidDevice || this.skip();
		await android.terminateApp("com.android.chrome");
		await android.launchApp("com.android.chrome");
		await new Promise(resolve => setTimeout(resolve, 3000));
		const elements = await android.getElementsOnScreen();
		await android.terminateApp("com.android.chrome");

		const searchElement = elements.find(e => e.label === "Search or type URL");
		assert.ok(searchElement !== undefined);
	});
});

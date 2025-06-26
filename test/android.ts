import assert from "node:assert";

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
		await android.terminateApp("com.android.chrome");
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
		await android.terminateApp("com.google.android.deskclock");
		await android.adb("shell", "pm", "clear", "com.google.android.deskclock");
		await android.launchApp("com.google.android.deskclock");

		// We probably start at Clock tab
		await new Promise(resolve => setTimeout(resolve, 3000));
		let elements = await android.getElementsOnScreen();
		const timerElement = elements.find(e => e.label === "Timer" && e.type === "android.widget.FrameLayout");
		assert.ok(timerElement !== undefined);
		await android.tap(timerElement.rect.x, timerElement.rect.y);

		// now we're in Timer tab
		await new Promise(resolve => setTimeout(resolve, 3000));
		elements = await android.getElementsOnScreen();
		const currentTime = elements.find(e => e.text === "00h 00m 00s");
		assert.ok(currentTime !== undefined, "Expected time to be 00h 00m 00s");
		await android.sendKeys("123456");

		// now the title has changed with new timer
		await new Promise(resolve => setTimeout(resolve, 3000));
		elements = await android.getElementsOnScreen();
		const newTime = elements.find(e => e.text === "12h 34m 56s");
		assert.ok(newTime !== undefined, "Expected time to be 12h 34m 56s");

		await android.terminateApp("com.google.android.deskclock");
	});

	it("should be able to launch and terminate an app", async function() {
		hasOneAndroidDevice || this.skip();

		// kill if running
		await android.terminateApp("com.android.chrome");

		await android.launchApp("com.android.chrome");
		await new Promise(resolve => setTimeout(resolve, 3000));
		const processes = await android.listRunningProcesses();
		assert.ok(processes.includes("com.android.chrome"));

		await android.terminateApp("com.android.chrome");
		const processes2 = await android.listRunningProcesses();
		assert.ok(!processes2.includes("com.android.chrome"));
	});

	it("should handle orientation changes", async function() {
		hasOneAndroidDevice || this.skip();

		// assume we start in portrait
		const originalOrientation = await android.getOrientation();
		assert.equal(originalOrientation, "portrait");
		const screenSize1 = await android.getScreenSize();

		// set to landscape
		await android.setOrientation("landscape");
		await new Promise(resolve => setTimeout(resolve, 1500));
		const orientation = await android.getOrientation();
		assert.equal(orientation, "landscape");
		const screenSize2 = await android.getScreenSize();

		// set to portrait
		await android.setOrientation("portrait");
		await new Promise(resolve => setTimeout(resolve, 1500));
		const orientation2 = await android.getOrientation();
		assert.equal(orientation2, "portrait");

		// screen size should not have changed
		assert.deepEqual(screenSize1, screenSize2);
	});
});

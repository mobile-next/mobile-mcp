
import assert from "assert";
import { AndroidRobot } from "../src/android";
import sharp from "sharp";

describe("android", () => {
	const android = new AndroidRobot();

	it("should be able to get the screen size", async () => {
		const screenSize = await android.getScreenSize();
		assert.ok(screenSize.width > 1024);
		assert.ok(screenSize.height > 1024);
		assert.equal(Object.keys(screenSize).length, 2, "screenSize should have exactly 2 properties");
	});

	it("should be able to take screenshot", async () => {
		const screenSize = await android.getScreenSize();

		const screenshot = await android.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);

		// must be a valid png image that matches the screen size
		const image = sharp(screenshot);
		const metadata = await image.metadata();
		assert.equal(metadata.width, screenSize.width);
		assert.equal(metadata.height, screenSize.height);
	});

	it("should be able to list apps", async () => {
		const apps = await android.listApps();
		assert.ok(apps.includes("com.android.settings"));
	});

	it("should be able to open a url", async () => {
		await android.adb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
		await android.openUrl("https://www.example.com");
	});

	it("should be able to list elements on screen", async () => {
		await android.adb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
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
	}).timeout(5000);

});

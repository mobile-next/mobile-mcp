import assert from "node:assert";

import { IosManager, IosRobot } from "../src/ios";
import { PNG } from "../src/png";

describe("ios", async () => {

	const manager = new IosManager();
	const devices = await manager.listDevices();
	const hasOneDevice = devices.length === 1;
	const robot = new IosRobot(devices?.[0]?.deviceId || "");

	it("should be able to get screenshot", async function() {
		hasOneDevice || this.skip();
		const screenshot = await robot.getScreenshot();
		// an black screenshot (screen is off) still consumes over 30KB
		assert.ok(screenshot.length > 128 * 1024);

		// must be a valid png image that matches the screen size
		const image = new PNG(screenshot);
		const pngSize = image.getDimensions();
		const screenSize = await robot.getScreenSize();

		// wda returns screen size as points, round up
		assert.equal(Math.ceil(pngSize.width / screenSize.scale), screenSize.width);
		assert.equal(Math.ceil(pngSize.height / screenSize.scale), screenSize.height);
	});
});

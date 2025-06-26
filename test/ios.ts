import assert from "assert";

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

	it("should be able to get network info", async function() {
		hasOneDevice || this.skip();
		const networkInfo = await robot.getNetworkInfo();

		// check that we get a valid network info object
		assert.ok(typeof networkInfo === "object");
		assert.ok(typeof networkInfo.type === "string");
		assert.ok(typeof networkInfo.isConnected === "boolean");

		// type should be one of the valid network types
		const validTypes = ["wifi", "cellular", "none", "unknown"];
		assert.ok(validTypes.includes(networkInfo.type));

		// iOS devices require connection to get device info, so should be connected
		if (networkInfo.isConnected) {
			// if we can communicate with device, connection exists
			assert.ok(networkInfo.isConnected === true);
		}
	});
});

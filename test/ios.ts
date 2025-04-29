import assert from "assert";

import { IosManager, IosRobot } from "../src/ios";

describe("ios", async () => {

	const manager = new IosManager();
	const devices = await manager.listDevices();
	const hasOneDevice = devices.length === 1;
	const robot = new IosRobot(devices?.[0]?.deviceId || "");

	it("should be able to get screenshot", async function() {
		hasOneDevice || this.skip();
		const screenshot = await robot.getScreenshot();
		assert.ok(screenshot.length > 64 * 1024);
	});
});

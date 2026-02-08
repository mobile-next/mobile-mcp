import assert from "node:assert";
import { MobileDevice } from "../src/mobile-device";
import { Mobilecli } from "../src/mobilecli";

describe("mobile-device", () => {
	const screenshotArgs = ["screenshot", "--device", "test-device", "--format", "png", "--output", "-"];

	it("should forward maxBufferBytes when taking a screenshot", async () => {
		const device = new MobileDevice("test-device");
		const calls: Array<{ args: string[]; maxBufferBytes?: number }> = [];
		const screenshotBuffer = Buffer.from("test-image");

		(device as any).mobilecli = {
			executeCommandBuffer: (args: string[], maxBufferBytes?: number) => {
				calls.push({ args, maxBufferBytes });
				return screenshotBuffer;
			},
		} as Mobilecli;

		const result = await device.getScreenshot(8 * 1024 * 1024);

		assert.equal(result, screenshotBuffer);
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0].args, screenshotArgs);
		assert.equal(calls[0].maxBufferBytes, 8 * 1024 * 1024);
	});

	it("should keep maxBufferBytes undefined when not provided", async () => {
		const device = new MobileDevice("test-device");
		const calls: Array<{ args: string[]; maxBufferBytes?: number }> = [];
		const screenshotBuffer = Buffer.from("test-image");

		(device as any).mobilecli = {
			executeCommandBuffer: (args: string[], maxBufferBytes?: number) => {
				calls.push({ args, maxBufferBytes });
				return screenshotBuffer;
			},
		} as Mobilecli;

		const result = await device.getScreenshot();

		assert.equal(result, screenshotBuffer);
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0].args, screenshotArgs);
		assert.equal(calls[0].maxBufferBytes, undefined);
	});
});

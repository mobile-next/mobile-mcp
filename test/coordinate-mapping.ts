import { test, expect } from "@playwright/test";
import { describeCoordinateMapping } from "../src/coordinate-mapping";

test.describe("coordinate mapping", () => {
	test("tells the model to multiply when the screenshot is smaller than the screen", () => {
		const text = describeCoordinateMapping({ width: 590, height: 1278 }, { width: 1179, height: 2556 });
		expect(text).toBe("Screenshot is 590x1278. Screen coordinates are 1179x2556. To tap something you see in this screenshot, multiply its x by 1.998 and y by 2.");
	});

	test("says coordinates match when the screenshot is the same size as the screen", () => {
		const text = describeCoordinateMapping({ width: 1080, height: 2400 }, { width: 1080, height: 2400 });
		expect(text).toBe("Screenshot is 1080x2400 and its coordinates match the screen.");
	});

	test("does not claim a match when the sizes differ by a single pixel", () => {
		const text = describeCoordinateMapping({ width: 10001, height: 2400 }, { width: 10000, height: 2400 });
		expect(text).toBe("Screenshot is 10001x2400. Screen coordinates are 10000x2400. To tap something you see in this screenshot, multiply its x by 1 and y by 1.");
	});

	test("handles a full-size pixel screenshot of a screen measured in points", () => {
		const text = describeCoordinateMapping({ width: 1179, height: 2556 }, { width: 393, height: 852 });
		expect(text).toBe("Screenshot is 1179x2556. Screen coordinates are 393x852. To tap something you see in this screenshot, multiply its x by 0.333 and y by 0.333.");
	});

	test("uses the rotated screen size when a landscape app is in front of a portrait-reported screen", () => {
		// A 720x1600 Android phone running a landscape-locked app: the screenshot is landscape,
		// but the device reports its natural portrait size.
		const text = describeCoordinateMapping({ width: 1024, height: 461 }, { width: 720, height: 1600 });
		expect(text).toBe("Screenshot is 1024x461. Screen coordinates are 1600x720. To tap something you see in this screenshot, multiply its x by 1.563 and y by 1.562.");
	});

	test("says coordinates match when a full-size landscape screenshot meets a portrait-reported screen", () => {
		const text = describeCoordinateMapping({ width: 1600, height: 720 }, { width: 720, height: 1600 });
		expect(text).toBe("Screenshot is 1600x720 and its coordinates match the screen.");
	});

	test("rotates a portrait screen measured in points to match a landscape pixel screenshot", () => {
		const text = describeCoordinateMapping({ width: 2556, height: 1179 }, { width: 393, height: 852 });
		expect(text).toBe("Screenshot is 2556x1179. Screen coordinates are 852x393. To tap something you see in this screenshot, multiply its x by 0.333 and y by 0.333.");
	});

	test("keeps a landscape-reported screen as is when the screenshot is landscape too", () => {
		const text = describeCoordinateMapping({ width: 1024, height: 461 }, { width: 1600, height: 720 });
		expect(text).toBe("Screenshot is 1024x461. Screen coordinates are 1600x720. To tap something you see in this screenshot, multiply its x by 1.563 and y by 1.562.");
	});

	test("returns nothing when the screen size is unknown", () => {
		expect(describeCoordinateMapping({ width: 590, height: 1278 }, { width: 0, height: 0 })).toBeNull();
	});

	test("returns nothing when the screenshot size is unknown", () => {
		expect(describeCoordinateMapping({ width: 0, height: 0 }, { width: 1080, height: 2400 })).toBeNull();
	});
});

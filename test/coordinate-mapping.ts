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

	test("handles a full-size pixel screenshot of a screen measured in points", () => {
		const text = describeCoordinateMapping({ width: 1179, height: 2556 }, { width: 393, height: 852 });
		expect(text).toBe("Screenshot is 1179x2556. Screen coordinates are 393x852. To tap something you see in this screenshot, multiply its x by 0.333 and y by 0.333.");
	});

	test("returns nothing when the screen size is unknown", () => {
		expect(describeCoordinateMapping({ width: 590, height: 1278 }, { width: 0, height: 0 })).toBeNull();
	});

	test("returns nothing when the screenshot size is unknown", () => {
		expect(describeCoordinateMapping({ width: 0, height: 0 }, { width: 1080, height: 2400 })).toBeNull();
	});
});

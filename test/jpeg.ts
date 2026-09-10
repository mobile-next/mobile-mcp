import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import { getJpegDimensions } from "../src/jpeg";

const loadFixture = (name: string): Buffer => readFileSync(join(__dirname, "fixtures", name));

test.describe("jpeg", () => {
	test("reads width and height of a baseline jpeg", () => {
		const dimensions = getJpegDimensions(loadFixture("baseline.jpg"));
		expect(dimensions).toEqual({ width: 96, height: 64 });
	});

	test("reads width and height of a progressive jpeg", () => {
		const dimensions = getJpegDimensions(loadFixture("progressive.jpg"));
		expect(dimensions).toEqual({ width: 30, height: 50 });
	});

	test("rejects a buffer that is not a jpeg", () => {
		const notAJpeg = Buffer.from("IAMADUCKIAMADUCKIAMADUCKIAMADUCKIAMADUCK");
		expect(() => getJpegDimensions(notAJpeg)).toThrow("Invalid JPEG");
	});

	test("rejects a jpeg that is cut off before its frame header", () => {
		const truncated = loadFixture("baseline.jpg").subarray(0, 20);
		expect(() => getJpegDimensions(truncated)).toThrow("Invalid JPEG");
	});
});

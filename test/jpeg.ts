import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import { getJpegDimensions } from "../src/jpeg";

const loadFixture = (name: string): Buffer => readFileSync(join(__dirname, "fixtures", name));

const SOF0 = Buffer.from([0xff, 0xc0]);

const findFrameHeader = (jpeg: Buffer): number => {
	const offset = jpeg.indexOf(SOF0);
	if (offset < 0) {
		throw new Error("fixture has no baseline frame header");
	}

	return offset;
};

const insertFillByteBeforeFrameHeader = (jpeg: Buffer): Buffer => {
	const offset = findFrameHeader(jpeg);
	return Buffer.concat([jpeg.subarray(0, offset), Buffer.from([0xff]), jpeg.subarray(offset)]);
};

const shrinkFrameHeaderLength = (jpeg: Buffer): Buffer => {
	const copy = Buffer.from(jpeg);
	copy.writeUInt16BE(2, findFrameHeader(copy) + 2);
	return copy;
};

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

	test("skips fill bytes that pad a marker", () => {
		const padded = insertFillByteBeforeFrameHeader(loadFixture("baseline.jpg"));
		expect(getJpegDimensions(padded)).toEqual({ width: 96, height: 64 });
	});

	test("rejects a frame header that is too short to hold dimensions", () => {
		const undersized = shrinkFrameHeaderLength(loadFixture("baseline.jpg"));
		expect(() => getJpegDimensions(undersized)).toThrow("Invalid JPEG");
	});

	test("rejects a jpeg that is cut off before its frame header", () => {
		const truncated = loadFixture("baseline.jpg").subarray(0, 20);
		expect(() => getJpegDimensions(truncated)).toThrow("Invalid JPEG");
	});
});

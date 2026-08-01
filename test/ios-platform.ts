import { test, expect } from "@playwright/test";

import { platformFromProductType } from "../src/ios";

test.describe("ios platform detection", () => {

	test("maps Apple TV product types to tvos", () => {
		expect(platformFromProductType("AppleTV14,1")).toBe("tvos");
		expect(platformFromProductType("AppleTV11,1")).toBe("tvos");
	});

	test("maps iPhone and iPad product types to ios", () => {
		expect(platformFromProductType("iPhone15,3")).toBe("ios");
		expect(platformFromProductType("iPad13,1")).toBe("ios");
	});

	test("defaults unknown product types to ios", () => {
		expect(platformFromProductType("")).toBe("ios");
	});
});

import { expect, test } from "@playwright/test";

import { __testInternals } from "../src/android";

test("uses the Windows adb executable name when ANDROID_HOME is configured", () => {
	expect(__testInternals.adbExecutableName("win32")).toBe("adb.exe");
	expect(__testInternals.adbExecutableName("linux")).toBe("adb");
});

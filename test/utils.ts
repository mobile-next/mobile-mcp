import { test, expect } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import {
	validatePackageName,
	validateLocale,
	validateFileExtension,
	validateOutputPath,
} from "../src/utils";

test.describe("utils", () => {

	test.describe("validatePackageName", () => {
		test("should accept a standard android package name", () => {
			expect(() => validatePackageName("com.example.app")).not.toThrow();
		});

		test("should accept a package name containing an underscore", () => {
			expect(() => validatePackageName("com.example.my_app")).not.toThrow();
		});

		test("should accept an ios bundle id containing a hyphen", () => {
			// CFBundleIdentifier explicitly permits hyphens, e.g. "com.some-company.app"
			expect(() => validatePackageName("com.some-company.app")).not.toThrow();
		});

		test("should reject a package name containing a space", () => {
			expect(() => validatePackageName("com.example app")).toThrow();
		});

		test("should reject a package name containing shell metacharacters", () => {
			expect(() => validatePackageName("com.example.app; rm -rf /")).toThrow();
		});

		test("should reject an empty string", () => {
			expect(() => validatePackageName("")).toThrow();
		});
	});

	test.describe("validateLocale", () => {
		test("should accept a single locale", () => {
			expect(() => validateLocale("en-US")).not.toThrow();
		});

		test("should accept a comma-separated list of locales", () => {
			expect(() => validateLocale("en-US, fr-FR")).not.toThrow();
		});

		test("should reject a locale containing shell metacharacters", () => {
			expect(() => validateLocale("en-US; rm -rf /")).toThrow();
		});
	});

	test.describe("validateFileExtension", () => {
		test("should accept a matching extension", () => {
			expect(() => validateFileExtension("/tmp/screenshot.png", [".png"], "save_screenshot")).not.toThrow();
		});

		test("should be case-insensitive", () => {
			expect(() => validateFileExtension("/tmp/screenshot.PNG", [".png"], "save_screenshot")).not.toThrow();
		});

		test("should reject a non-matching extension", () => {
			expect(() => validateFileExtension("/tmp/screenshot.txt", [".png", ".jpg"], "save_screenshot")).toThrow();
		});

		test("should reject a missing extension", () => {
			expect(() => validateFileExtension("/tmp/screenshot", [".png"], "save_screenshot")).toThrow();
		});
	});

	test.describe("validateOutputPath", () => {
		test("should accept a path under the os temp directory", () => {
			const target = path.join(os.tmpdir(), "mobile-mcp-test-output.png");
			expect(() => validateOutputPath(target)).not.toThrow();
		});

		test("should accept a path under the current working directory", () => {
			const target = path.join(process.cwd(), "mobile-mcp-test-output.png");
			expect(() => validateOutputPath(target)).not.toThrow();
		});

		test("should reject a path outside of the allowed directories", () => {
			const outside = process.platform === "win32"
				? "C:\\Windows\\mobile-mcp-test-output.png"
				: "/etc/mobile-mcp-test-output.png";

			expect(() => validateOutputPath(outside)).toThrow();
		});

		test("should reject a path that escapes cwd via traversal", () => {
			// A single ".." isn't reliably outside every allowed root (cwd can end up
			// nested under os.tmpdir() in some environments). Climbing 32 levels always
			// bottoms out at the filesystem root, which can never be a descendant of cwd,
			// os.tmpdir(), or any other allowed root - regardless of where either lives.
			const escape = new Array(32).fill("..").join(path.sep);
			const target = path.join(process.cwd(), escape, "mobile-mcp-test-output.png");
			expect(() => validateOutputPath(target)).toThrow();
		});
	});
});

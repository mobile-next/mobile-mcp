import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
	validatePackageName,
	validateLocale,
	validateFileExtension,
	validateOutputPath,
	withLowercaseScheme,
	writeOutputFile,
	moveOutputFile,
	finishRecording,
	createPrivateOutputPath,
} from "../src/utils";

test.describe("utils", () => {

	// android resolves an intent's scheme case-sensitively, so HTTPS://example.com
	// finds no browser, although url schemes are case-insensitive
	test.describe("withLowercaseScheme", () => {
		test("should lowercase an upper-case scheme", () => {
			expect(withLowercaseScheme("HTTPS://EXAMPLE.COM")).toBe("https://EXAMPLE.COM");
		});

		test("should lowercase a mixed-case scheme and keep the case of the path", () => {
			expect(withLowercaseScheme("Http://example.com/Path?Q=A")).toBe("http://example.com/Path?Q=A");
		});

		test("should lowercase a custom scheme", () => {
			expect(withLowercaseScheme("MyApp://Screen/Two")).toBe("myapp://Screen/Two");
		});

		test("should leave a lower-case url unchanged", () => {
			expect(withLowercaseScheme("https://example.com/A")).toBe("https://example.com/A");
		});

		test("should leave a string without a scheme unchanged", () => {
			expect(withLowercaseScheme("Example.com/Path")).toBe("Example.com/Path");
		});
	});

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

		// some mcp hosts start the server from / or from the home directory, which
		// must not turn the whole disk or the whole home into an allowed root
		const whileRunningFrom = (dir: string, check: () => void) => {
			const original = process.cwd();
			process.chdir(dir);
			try {
				check();
			} finally {
				process.chdir(original);
			}
		};

		test("should reject a path in the home directory when started from the home directory", () => {
			whileRunningFrom(os.homedir(), () => {
				expect(() => validateOutputPath(path.join(os.homedir(), "mobile-mcp-test-output.png"))).toThrow();
			});
		});

		test("should reject a path anywhere on disk when started from the filesystem root", () => {
			const root = path.parse(process.cwd()).root;
			whileRunningFrom(root, () => {
				expect(() => validateOutputPath(path.join(os.homedir(), "mobile-mcp-test-output.png"))).toThrow();
			});
		});

		test("should still accept the temp directory when started from the home directory", () => {
			whileRunningFrom(os.homedir(), () => {
				expect(() => validateOutputPath(path.join(os.tmpdir(), "mobile-mcp-test-output.png"))).not.toThrow();
			});
		});
	});

	// a symlink as the final path component would redirect a write, so it must be
	// resolved too, not just the parent directory (see issue #412)
	test.describe("validateOutputPath symlinks", () => {
		let nameCounter = 0;
		const createSymlink = (target: string): string => {
			const link = path.join(process.cwd(), `mobile-mcp-symlink-${process.pid}-${Date.now()}-${nameCounter++}.png`);
			fs.rmSync(link, { force: true });
			fs.symlinkSync(target, link);
			return link;
		};

		// windows needs privileges to create a symlink, so this only runs where the
		// behaviour it guards can be exercised
		test.skip(process.platform === "win32", "creating a symlink needs elevated rights on windows");

		test("should reject a final-component symlink whose target is outside the allowed directories", () => {
			const link = createSymlink(path.join(path.sep, "mobile-mcp-outside", "escaped.png"));
			try {
				expect(() => validateOutputPath(link)).toThrow();
			} finally {
				fs.rmSync(link, { force: true });
			}
		});

		test("should still accept a final-component symlink whose target stays inside an allowed directory", () => {
			const link = createSymlink(path.join(os.tmpdir(), "mobile-mcp-symlink-inside.png"));
			try {
				expect(() => validateOutputPath(link)).not.toThrow();
			} finally {
				fs.rmSync(link, { force: true });
			}
		});

		// a single link is not enough: the target of the first link can itself be a
		// link inside an allowed root that bottoms out somewhere outside it, so the
		// whole chain has to be followed - stopping at the first hop accepts an
		// in-root name while the write lands outside it
		test("should reject a symlink chain whose dangling target is outside the allowed directories", () => {
			const outside = path.join(path.sep, "mobile-mcp-outside", "escaped.png");
			const first = createSymlink(outside);
			const second = createSymlink(path.basename(first));
			try {
				expect(() => validateOutputPath(first)).toThrow();
				expect(() => validateOutputPath(second)).toThrow();
			} finally {
				fs.rmSync(second, { force: true });
				fs.rmSync(first, { force: true });
			}
		});

		test("should still accept a symlink chain whose target stays inside an allowed directory", () => {
			const first = createSymlink(path.join(os.tmpdir(), "mobile-mcp-chain-inside.png"));
			const second = createSymlink(path.basename(first));
			try {
				expect(() => validateOutputPath(first)).not.toThrow();
				expect(() => validateOutputPath(second)).not.toThrow();
			} finally {
				fs.rmSync(second, { force: true });
				fs.rmSync(first, { force: true });
			}
		});

		test("should reject a symlink cycle", () => {
			const first = createSymlink(path.join(process.cwd(), "mobile-mcp-cycle-placeholder.png"));
			const second = createSymlink(path.basename(first));
			fs.rmSync(first);
			fs.symlinkSync(path.basename(second), first);
			try {
				expect(() => validateOutputPath(first)).toThrow(/too many levels of symbolic links/);
			} finally {
				fs.rmSync(second, { force: true });
				fs.rmSync(first, { force: true });
			}
		});
	});

	// a symlink can be planted between validateOutputPath and the write, so the
	// write itself must refuse to follow a symlink at the final component
	test.describe("writeOutputFile", () => {
		test.skip(process.platform === "win32", "creating a symlink needs elevated rights on windows");

		const uniqueTempPath = (name: string): string => path.join(os.tmpdir(), `mobile-mcp-${process.pid}-${Date.now()}-${name}`);

		test("should not write through a symlink planted after the path was validated", () => {
			const victim = uniqueTempPath("victim.txt");
			const output = uniqueTempPath("output.log");
			fs.writeFileSync(victim, "ORIGINAL");
			try {
				validateOutputPath(output);
				fs.symlinkSync(victim, output);

				expect(() => writeOutputFile(output, "OVERWRITTEN")).toThrow();
				expect(fs.readFileSync(victim, "utf8")).toBe("ORIGINAL");
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(victim, { force: true });
			}
		});

		test("should write a regular file", () => {
			const output = uniqueTempPath("regular.log");
			try {
				writeOutputFile(output, "HELLO");
				expect(fs.readFileSync(output, "utf8")).toBe("HELLO");
			} finally {
				fs.rmSync(output, { force: true });
			}
		});
	});

	// screen recordings are written by mobilecli, so they land in a private
	// directory first and are moved to the requested output afterwards
	test.describe("moveOutputFile", () => {
		test.skip(process.platform === "win32", "creating a symlink needs elevated rights on windows");

		const uniqueTempPath = (name: string): string => path.join(os.tmpdir(), `mobile-mcp-${process.pid}-${Date.now()}-${name}`);

		test("should not move a recording through a symlink planted at the output path", () => {
			const victim = uniqueTempPath("victim.txt");
			const recording = uniqueTempPath("recording.mp4");
			const output = uniqueTempPath("output.mp4");
			fs.writeFileSync(victim, "ORIGINAL");
			fs.writeFileSync(recording, "VIDEO");
			fs.symlinkSync(victim, output);
			try {
				moveOutputFile(recording, output);

				expect(fs.readFileSync(victim, "utf8")).toBe("ORIGINAL");
				expect(fs.lstatSync(output).isSymbolicLink()).toBe(false);
				expect(fs.readFileSync(output, "utf8")).toBe("VIDEO");
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(recording, { force: true });
				fs.rmSync(victim, { force: true });
			}
		});

		test("should move a recording to a new output path", () => {
			const recording = uniqueTempPath("recording.mp4");
			const output = uniqueTempPath("output.mp4");
			fs.writeFileSync(recording, "VIDEO");
			try {
				moveOutputFile(recording, output);

				expect(fs.readFileSync(output, "utf8")).toBe("VIDEO");
				expect(fs.existsSync(recording)).toBe(false);
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(recording, { force: true });
			}
		});
	});

	test.describe("finishRecording", () => {
		const uniqueTempPath = (name: string): string => path.join(os.tmpdir(), `mobile-mcp-${process.pid}-${Date.now()}-${name}`);

		// rename fails with EXDEV when the private directory and the output live on
		// different filesystems; simulate that and a copy that fails halfway
		const whileRenameCrossesFilesystemsAndCopyFails = (check: () => void) => {
			const originalRename = fs.renameSync;
			const originalCopy = fs.copyFileSync;
			fs.renameSync = () => {
				throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
			};
			fs.copyFileSync = () => {
				throw new Error("disk full");
			};
			try {
				check();
			} finally {
				fs.renameSync = originalRename;
				fs.copyFileSync = originalCopy;
			}
		};

		test("should report a failure when mobilecli never created the recording", () => {
			const recording = createPrivateOutputPath("recording.mp4");
			const output = uniqueTempPath("previous.mp4");
			fs.writeFileSync(output, "PREVIOUS RECORDING");
			try {
				expect(finishRecording(recording, output)).toBeDefined();
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(path.dirname(recording), { recursive: true, force: true });
			}
		});

		test("should remove the private directory after moving the recording", () => {
			const recording = createPrivateOutputPath("recording.mp4");
			const output = uniqueTempPath("output.mp4");
			fs.writeFileSync(recording, "VIDEO");
			try {
				expect(finishRecording(recording, output)).toBeUndefined();
				expect(fs.readFileSync(output, "utf8")).toBe("VIDEO");
				expect(fs.existsSync(path.dirname(recording))).toBe(false);
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(path.dirname(recording), { recursive: true, force: true });
			}
		});

		test("should keep the existing output when a cross-filesystem copy fails", () => {
			const recording = uniqueTempPath("recording.mp4");
			const output = uniqueTempPath("existing.mp4");
			fs.writeFileSync(recording, "VIDEO");
			fs.writeFileSync(output, "EXISTING");
			try {
				whileRenameCrossesFilesystemsAndCopyFails(() => {
					expect(() => moveOutputFile(recording, output)).toThrow();
				});
				expect(fs.readFileSync(output, "utf8")).toBe("EXISTING");
				expect(fs.readFileSync(recording, "utf8")).toBe("VIDEO");
			} finally {
				fs.rmSync(output, { force: true });
				fs.rmSync(recording, { force: true });
			}
		});
	});
});

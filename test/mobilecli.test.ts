import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, expect } from "@playwright/test";
import { Mobilecli } from "../src/mobilecli";

type ExecuteCommandCall = {
	args: string[];
};

function createMockMobilecli(mockResponse: string): { mobilecli: Mobilecli; calls: ExecuteCommandCall[] } {
	const mobilecli = new Mobilecli();
	const calls: ExecuteCommandCall[] = [];

	mobilecli.executeCommand = function(args: string[]): string {
		calls.push({ args });
		return mockResponse;
	};

	return { mobilecli, calls };
}

test.describe("mobilecli", () => {

	const mobilecli = new Mobilecli();

	test.describe("getVersion", () => {
		test("should return a version string", () => {
			const version = mobilecli.getVersion();
			expect(version.length).toBeGreaterThan(0);
			expect(version).not.toContain("failed");
		});

		test("should return version in correct format", () => {
			const version = mobilecli.getVersion();
			// Version should be in format like "0.0.45" or similar
			const versionPattern = /^\d+\.\d+\.\d+/;
			expect(version, `Version "${version}" should match pattern X.Y.Z`).toMatch(versionPattern);
		});

		test("should return failed when MOBILECLI_PATH points to invalid location", () => {
			try {
				process.env.MOBILECLI_PATH = "/tmp";
				const mobilecli = new Mobilecli();
				const version = mobilecli.getVersion();
				expect(version, `Expected version to include "failed" but got: ${version}`).toContain("failed");
			} finally {
				delete process.env.MOBILECLI_PATH;
			}
		});

		test("should call executeCommand with --version argument", () => {
			const { mobilecli, calls } = createMockMobilecli("mobilecli version 1.0.0");
			const version = mobilecli.getVersion();

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["--version"]);
			expect(version).toBe("1.0.0");
		});
	});

	test.describe("getMobilecliPath", () => {
		test("should find the binary through mobilewright in a pnpm layout", () => {
			const platform = process.platform === "win32" ? "windows" : process.platform;
			const arch = process.arch === "arm64" ? "arm64" : "amd64";
			const scopedPackage = `mobilecli-${platform}-${arch}`;
			const binaryName = `${scopedPackage}${process.platform === "win32" ? ".exe" : ""}`;

			const root = realpathSync(mkdtempSync(join(tmpdir(), "mobilecli-pnpm-")));
			const store = join(root, "node_modules", ".pnpm");
			const writeFile = (path: string, content: string) => {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, content);
			};
			const link = (target: string, path: string) => {
				mkdirSync(dirname(path), { recursive: true });
				symlinkSync(join(store, target), path, "junction");
			};
			const esmPackage = (dir: string, name: string) => {
				writeFile(join(store, dir, "package.json"), JSON.stringify({ name, type: "module", exports: { ".": { default: "./dist/index.js" } } }));
				writeFile(join(store, dir, "dist", "index.js"), "");
			};

			const mcp = "@mobilenext+mobile-mcp@1.0.0/node_modules";
			const mobilewright = "mobilewright@0.0.63/node_modules";
			const driver = "@mobilewright+driver-mobilecli@0.0.63/node_modules";
			const mobilecli = "mobilecli@1.0.17/node_modules";
			const binaryPackage = `@mobilenext+${scopedPackage}@1.0.17/node_modules/@mobilenext/${scopedPackage}`;

			try {
				writeFile(join(store, mcp, "@mobilenext", "mobile-mcp", "lib", "mobilecli.js"), "");
				link(`${mobilewright}/mobilewright`, join(store, mcp, "mobilewright"));
				esmPackage(`${mobilewright}/mobilewright`, "mobilewright");
				link(`${driver}/@mobilewright/driver-mobilecli`, join(store, mobilewright, "@mobilewright", "driver-mobilecli"));
				esmPackage(`${driver}/@mobilewright/driver-mobilecli`, "@mobilewright/driver-mobilecli");
				link(`${mobilecli}/mobilecli`, join(store, driver, "mobilecli"));
				writeFile(join(store, mobilecli, "mobilecli", "package.json"), JSON.stringify({ name: "mobilecli" }));
				link(binaryPackage, join(store, mobilecli, "@mobilenext", scopedPackage));
				writeFile(join(store, binaryPackage, "package.json"), JSON.stringify({ name: `@mobilenext/${scopedPackage}` }));
				writeFile(join(store, binaryPackage, binaryName), "");

				const currentPath = join(store, mcp, "@mobilenext", "mobile-mcp", "lib", "mobilecli.js");
				expect((Mobilecli as any).getMobilecliPath(currentPath)).toBe(join(store, binaryPackage, binaryName));
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});

	test.describe("getDevices", () => {
		const mockDevicesResponse = JSON.stringify({
			status: "ok",
			data: {
				devices: [
					{
						id: "device1",
						name: "Test Device",
						platform: "ios",
						type: "simulator",
						version: "17.0"
					}
				]
			}
		});

		test("should call executeCommand with devices argument when no options", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices();

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["devices"]);
		});

		test("should call executeCommand with platform filter", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ platform: "ios" });

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["devices", "--platform", "ios"]);
		});

		test("should call executeCommand with type filter", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ type: "simulator" });

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["devices", "--type", "simulator"]);
		});

		test("should call executeCommand with includeOffline flag", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ includeOffline: true });

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["devices", "--include-offline"]);
		});

		test("should call executeCommand with combined options", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({
				platform: "android",
				type: "emulator",
				includeOffline: true
			});

			expect(calls.length).toBe(1);
			expect(calls[0].args).toEqual(["devices", "--include-offline", "--platform", "android", "--type", "emulator"]);
		});
	});
});

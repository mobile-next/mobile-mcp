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

function withMobilecliPath(mobilecliPath: string, fn: () => void): void {
	const previous = process.env.MOBILECLI_PATH;
	process.env.MOBILECLI_PATH = mobilecliPath;
	try {
		fn();
	} finally {
		if (previous === undefined) {
			delete process.env.MOBILECLI_PATH;
		} else {
			process.env.MOBILECLI_PATH = previous;
		}

	}
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
			withMobilecliPath("/tmp", () => {
				const mobilecli = new Mobilecli();
				const version = mobilecli.getVersion();
				expect(version, `Expected version to include "failed" but got: ${version}`).toContain("failed");
			});
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
				// an empty MOBILECLI_PATH counts as unset, so a developer's own override cannot win here
				withMobilecliPath("", () => {
					expect((Mobilecli as any).getMobilecliPath(currentPath)).toBe(join(store, binaryPackage, binaryName));
				});
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

	test.describe("remoteListDevices", () => {
		test("should call executeCommand with remote list-devices", () => {
			const { mobilecli, calls } = createMockMobilecli("{}");

			mobilecli.remoteListDevices();

			expect(calls).toEqual([{ args: ["remote", "list-devices"] }]);
		});
	});

	test.describe("executeCommand", () => {
		test("should return output larger than node's default 1MB maxBuffer", () => {
			// run node itself as the "mobilecli" binary so the test works on every platform
			const outputSize = 2 * 1024 * 1024;
			withMobilecliPath(process.execPath, () => {
				const mobilecli = new Mobilecli();
				const output = mobilecli.executeCommand(["-e", `process.stdout.write("a".repeat(${outputSize}))`]);
				expect(output.length).toBe(outputSize);
			});
		});
	});

	test.describe("agentStatus", () => {
		test("should return fail status when agent is not installed and mobilecli exits non-zero", () => {
			const mobilecli = new Mobilecli();
			const notInstalledResponse = JSON.stringify({ status: "fail", data: { message: "Agent is not installed on the device" } });
			mobilecli.executeCommand = function(): string {
				throw Object.assign(new Error("Command failed"), { status: 1, stdout: notInstalledResponse });
			};

			const status = mobilecli.agentStatus("SIM-ID");

			expect(status.status).toBe("fail");
		});
	});

	test.describe("crashesGet", () => {
		test("should pass -- before the crash id so leading-dash ids are not parsed as flags", () => {
			const mobilecli = new Mobilecli();
			const calls: ExecuteCommandCall[] = [];
			mobilecli.executeCommandBuffer = function(args: string[]): Buffer {
				calls.push({ args });
				return Buffer.from(JSON.stringify({ status: "ok", data: { id: "--help", content: "trace" } }));
			};

			const response = mobilecli.crashesGet("device-1", "--help");

			expect(calls).toEqual([{ args: ["device", "crashes", "get", "--device", "device-1", "--", "--help"] }]);
			expect(response.data.id).toBe("--help");
		});

		test("should treat flag-like crash ids as data when invoking real mobilecli", () => {
			for (const id of ["--help", "--insecure-storage"]) {
				let caught: unknown;
				try {
					mobilecli.crashesGet("nonexistent-device-574", id);
				} catch (error) {
					caught = error;
				}

				expect(caught).toBeInstanceOf(Error);
				expect(caught).not.toBeInstanceOf(SyntaxError);
				const message = (caught as Error).message;
				expect(message).toContain("device not found");
				expect(message).not.toContain("accepts 1 arg(s)");
			}
		});
	});
});

import { test, expect } from "@playwright/test";
import { Mobilecli } from "../src/mobilecli";
import { ActionableError } from "../src/robot";

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

	test.describe("filesystem commands", () => {
		const okResponse = JSON.stringify({ status: "ok" });

		test("pull passes paths after -- so they are never parsed as flags", () => {
			const { mobilecli, calls } = createMockMobilecli(okResponse);
			mobilecli.fsPull("device1", "/data/remote.txt", "/tmp/local.txt");
			expect(calls[0].args).toEqual(["fs", "pull", "--device", "device1", "--", "/data/remote.txt", "/tmp/local.txt"]);
		});

		test("push passes paths after --", () => {
			const { mobilecli, calls } = createMockMobilecli(okResponse);
			mobilecli.fsPush("device1", "/tmp/local.txt", "/data/remote.txt");
			expect(calls[0].args).toEqual(["fs", "push", "--device", "device1", "--", "/tmp/local.txt", "/data/remote.txt"]);
		});

		test("mkdir puts -p before --", () => {
			const { mobilecli, calls } = createMockMobilecli(okResponse);
			mobilecli.fsMkdir("device1", "/data/a/b/c", true);
			expect(calls[0].args).toEqual(["fs", "mkdir", "-p", "--device", "device1", "--", "/data/a/b/c"]);
		});

		test("rm is only recursive when asked, even if the path looks like -r", () => {
			const { mobilecli, calls } = createMockMobilecli(okResponse);
			mobilecli.fsRm("device1", "-r");
			expect(calls[0].args).toEqual(["fs", "rm", "--device", "device1", "--", "-r"]);
		});

		test("rm puts -r before -- when recursive", () => {
			const { mobilecli, calls } = createMockMobilecli(okResponse);
			mobilecli.fsRm("device1", "/data/mydir", true);
			expect(calls[0].args).toEqual(["fs", "rm", "-r", "--device", "device1", "--", "/data/mydir"]);
		});

		test("apps path passes the bundle id after --", () => {
			const { mobilecli, calls } = createMockMobilecli(JSON.stringify({ status: "ok", data: { path: "/containers/app" } }));
			const result = mobilecli.appsPath("device1", "com.example.app");
			expect(calls[0].args).toEqual(["apps", "path", "--device", "device1", "--", "com.example.app"]);
			expect(result.data.path).toBe("/containers/app");
		});

		test("ls without a path lists the device root", () => {
			const { mobilecli, calls } = createMockMobilecli(JSON.stringify({ status: "ok", data: [] }));
			mobilecli.fsList("device1");
			expect(calls[0].args).toEqual(["fs", "ls", "--device", "device1", "--"]);
		});

		test("ls parses the file list", () => {
			const files = [
				{ name: "Documents", path: "/Documents", size: 0, modTime: "2026-01-01T00:00:00Z", isDir: true },
				{ name: "config.json", path: "/config.json", size: 512, modTime: "2026-01-01T00:00:00Z", isDir: false },
			];
			const { mobilecli, calls } = createMockMobilecli(JSON.stringify({ status: "ok", data: files }));
			const result = mobilecli.fsList("device1", "/data");
			expect(calls[0].args).toEqual(["fs", "ls", "--device", "device1", "--", "/data"]);
			expect(result.data.map(entry => entry.name)).toEqual(["Documents", "config.json"]);
		});

		test("surfaces mobilecli's error message when it exits non-zero", () => {
			const mobilecli = new Mobilecli();
			const outsideResponse = JSON.stringify({ status: "error", error: "path '/etc' is outside the simulator device directory" });
			mobilecli.executeCommand = function(): string {
				throw Object.assign(new Error("Command failed"), { status: 1, stdout: outsideResponse });
			};

			expect(() => mobilecli.fsRm("device1", "/etc")).toThrow(ActionableError);
			expect(() => mobilecli.fsRm("device1", "/etc")).toThrow("path '/etc' is outside the simulator device directory");
		});

		test("rethrows the original error when mobilecli prints no json", () => {
			const mobilecli = new Mobilecli();
			mobilecli.executeCommand = function(): string {
				throw new Error("spawn ENOENT");
			};

			expect(() => mobilecli.fsList("device1")).toThrow("spawn ENOENT");
		});
	});
});

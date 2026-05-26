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

	describe("fsList", () => {
		const mockResponse = JSON.stringify({
			status: "ok",
			data: [
				{ name: "Documents", path: "/data/Documents", size: 0, modTime: "2026-01-01T00:00:00Z", isDir: true },
				{ name: "config.json", path: "/data/config.json", size: 512, modTime: "2026-01-01T00:00:00Z", isDir: false },
			]
		});

		it("should call fs ls with device only", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsList("device1");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "ls", "--device", "device1"]);
		});

		it("should call fs ls with bundleId", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsList("device1", "com.example.app");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "ls", "com.example.app", "--device", "device1"]);
		});

		it("should call fs ls with bundleId and path", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsList("device1", "com.example.app", "/Documents");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "ls", "com.example.app", "/Documents", "--device", "device1"]);
		});

		it("should parse and return the file list", () => {
			const { mobilecli } = createMockMobilecli(mockResponse);
			const result = mobilecli.fsList("device1");

			assert.equal(result.status, "ok");
			assert.equal(result.data.length, 2);
			assert.equal(result.data[0].name, "Documents");
			assert.equal(result.data[0].isDir, true);
			assert.equal(result.data[1].name, "config.json");
			assert.equal(result.data[1].size, 512);
		});
	});
});

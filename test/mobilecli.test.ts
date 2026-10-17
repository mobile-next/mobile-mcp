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

	test.describe("executeCommand", () => {
		test("should return output larger than node's default 1MB maxBuffer", () => {
			// run node itself as the "mobilecli" binary so the test works on every platform
			const outputSize = 2 * 1024 * 1024;
			try {
				process.env.MOBILECLI_PATH = process.execPath;
				const mobilecli = new Mobilecli();
				const output = mobilecli.executeCommand(["-e", `process.stdout.write("a".repeat(${outputSize}))`]);
				expect(output.length).toBe(outputSize);
			} finally {
				delete process.env.MOBILECLI_PATH;
			}
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
});

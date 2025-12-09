import assert from "node:assert";
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

describe("mobilecli", () => {

	const mobilecli = new Mobilecli();

	describe("getVersion", () => {
		it("should return a version string", () => {
			const version = mobilecli.getVersion();
			assert.ok(version.length > 0);
			assert.ok(!version.includes("failed"));
		});

		it("should return version in correct format", () => {
			const version = mobilecli.getVersion();
			// Version should be in format like "0.0.45" or similar
			const versionPattern = /^\d+\.\d+\.\d+/;
			assert.ok(versionPattern.test(version), `Version "${version}" should match pattern X.Y.Z`);
		});

		it("should return failed when MOBILECLI_PATH points to invalid location", () => {
			try {
				process.env.MOBILECLI_PATH = "/tmp";
				const mobilecli = new Mobilecli();
				const version = mobilecli.getVersion();
				assert.ok(version.includes("failed"), `Expected version to include "failed" but got: ${version}`);
			} finally {
				delete process.env.MOBILECLI_PATH;
			}
		});

		it("should call executeCommand with --version argument", () => {
			const { mobilecli, calls } = createMockMobilecli("mobilecli version 1.0.0");
			const version = mobilecli.getVersion();

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["--version"]);
			assert.equal(version, "1.0.0");
		});
	});

	describe("getDevices", () => {
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

		it("should call executeCommand with devices argument when no options", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices();

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["devices"]);
		});

		it("should call executeCommand with platform filter", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ platform: "ios" });

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["devices", "--platform", "ios"]);
		});

		it("should call executeCommand with type filter", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ type: "simulator" });

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["devices", "--type", "simulator"]);
		});

		it("should call executeCommand with includeOffline flag", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({ includeOffline: true });

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["devices", "--include-offline"]);
		});

		it("should call executeCommand with combined options", () => {
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);
			mobilecli.getDevices({
				platform: "android",
				type: "emulator",
				includeOffline: true
			});

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["devices", "--include-offline", "--platform", "android", "--type", "emulator"]);
		});
	});
});

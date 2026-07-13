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

	test.describe("resolveAndroidDeviceId", () => {
		test("maps an adb emulator id to the mobilecli AVD id", () => {
			const mockDevicesResponse = JSON.stringify({
				status: "ok",
				data: {
					devices: [{
						id: "Codex_API_36",
						name: "Codex API 36",
						platform: "android",
						type: "emulator",
						version: "16",
						state: "online",
					}],
				},
			});
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);

			const resolved = mobilecli.resolveAndroidDeviceId("emulator-5554", "Codex API 36");

			expect(resolved).toBe("Codex_API_36");
			expect(calls).toEqual([{ args: ["devices", "--platform", "android"] }]);
		});

		test("keeps a physical-device serial without querying mobilecli", () => {
			const mockDevicesResponse = JSON.stringify({
				status: "ok",
				data: {
					devices: [{
						id: "R5CT123456",
						name: "Galaxy S24",
						platform: "android",
						type: "real",
						version: "16",
						state: "online",
					}],
				},
			});
			const { mobilecli, calls } = createMockMobilecli(mockDevicesResponse);

			expect(mobilecli.resolveAndroidDeviceId("R5CT123456", "Galaxy S24")).toBe("R5CT123456");
			expect(calls).toEqual([]);
		});

		test("falls back to the AVD id when mobilecli discovery has no match", () => {
			const mockDevicesResponse = JSON.stringify({ status: "ok", data: { devices: [] } });
			const { mobilecli } = createMockMobilecli(mockDevicesResponse);

			expect(mobilecli.resolveAndroidDeviceId("emulator-5554", "Codex API 36")).toBe("Codex_API_36");
			expect(mobilecli.resolveAndroidDeviceId("emulator-5554", "")).toBe("emulator-5554");
		});
	});
});

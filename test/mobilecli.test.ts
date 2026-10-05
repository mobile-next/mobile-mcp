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

	describe("fsPull", () => {
		const mockResponse = JSON.stringify({ status: "ok" });

		it("should call fs pull with remote path, local path, and device", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsPull("device1", "/data/remote.txt", "/tmp/local.txt");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "pull", "/data/remote.txt", "/tmp/local.txt", "--device", "device1"]);
		});
	});

	describe("fsPush", () => {
		const mockResponse = JSON.stringify({ status: "ok" });

		it("should call fs push with local path, remote path, and device", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsPush("device1", "/tmp/local.txt", "/data/remote.txt");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "push", "/tmp/local.txt", "/data/remote.txt", "--device", "device1"]);
		});
	});

	describe("appsPath", () => {
		const mockResponse = JSON.stringify({
			status: "ok",
			data: { path: "/var/containers/Bundle/Application/ABC123" }
		});

		it("should call apps path with bundle id and device", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.appsPath("device1", "com.example.app");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["apps", "path", "com.example.app", "--device", "device1"]);
		});

		it("should parse and return the container path", () => {
			const { mobilecli } = createMockMobilecli(mockResponse);
			const result = mobilecli.appsPath("device1", "com.example.app");

			assert.equal(result.status, "ok");
			assert.equal(result.data.path, "/var/containers/Bundle/Application/ABC123");
		});
	});

	describe("fsMkdir", () => {
		const mockResponse = JSON.stringify({ status: "ok" });

		it("should call fs mkdir with path and device", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsMkdir("device1", "/data/newdir");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "mkdir", "/data/newdir", "--device", "device1"]);
		});

		it("should include bundleId when provided", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsMkdir("device1", "/Documents/newdir", "com.example.app");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "mkdir", "com.example.app", "/Documents/newdir", "--device", "device1"]);
		});

		it("should include -p flag when parents is true", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsMkdir("device1", "/data/a/b/c", undefined, true);

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "mkdir", "/data/a/b/c", "-p", "--device", "device1"]);
		});
	});

	describe("fsRm", () => {
		const mockResponse = JSON.stringify({ status: "ok" });

		it("should call fs rm with path and device", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsRm("device1", "/data/file.txt");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "rm", "/data/file.txt", "--device", "device1"]);
		});

		it("should include bundleId when provided", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsRm("device1", "/Documents/file.txt", "com.example.app");

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "rm", "com.example.app", "/Documents/file.txt", "--device", "device1"]);
		});

		it("should include -r flag when recursive is true", () => {
			const { mobilecli, calls } = createMockMobilecli(mockResponse);
			mobilecli.fsRm("device1", "/data/mydir", undefined, true);

			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].args, ["fs", "rm", "/data/mydir", "-r", "--device", "device1"]);
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

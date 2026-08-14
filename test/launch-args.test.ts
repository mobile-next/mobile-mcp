import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execFileSync } from "node:child_process";

import { AndroidRobot } from "../src/android";
import { IosRobot } from "../src/ios";
import { Simctl } from "../src/iphone-simulator";
import { MobileDevice } from "../src/mobile-device";
import { validateLaunchArgs } from "../src/utils";
import { ActionableError, Robot } from "../src/robot";
import { createMcpServer } from "../src/server";

test.describe("launch arguments", () => {

	test.describe("validateLaunchArgs", () => {
		test("should accept identifier-like keys and safe values", () => {
			expect(() => validateLaunchArgs({ "FeatureXEnabled": "true", "api.base-url": "https://staging.example.com/v1" })).not.toThrow();
		});

		test("should accept an empty map", () => {
			expect(() => validateLaunchArgs({})).not.toThrow();
		});

		test("should reject keys with shell metacharacters", () => {
			expect(() => validateLaunchArgs({ "bad key": "value" })).toThrow(ActionableError);
			expect(() => validateLaunchArgs({ "key;rm": "value" })).toThrow(ActionableError);
		});

		test("should accept arbitrary non-NUL string values", () => {
			const values = [
				"",
				"value with spaces",
				"it's enabled",
				"{\"enabled\":true}",
				"https://example.test?a=1&b=2",
				"$(literal); `text`",
			];

			for (const value of values) {
				expect(() => validateLaunchArgs({ key: value })).not.toThrow();
			}
		});

		test("should reject NUL values that child processes cannot accept", () => {
			expect(() => validateLaunchArgs({ key: "before\0after" })).toThrow(ActionableError);
		});
	});

	test.describe("AndroidRobot.launchApp", () => {
		// mock adb/silentAdb so these run without a device.
		const createRobot = (): { robot: AndroidRobot; calls: string[][] } => {
			const robot = new AndroidRobot("mock-device");
			const calls: string[][] = [];
			const record = (...args: string[]): Buffer => {
				calls.push(args);
				// resolve-activity output for the launcher activity lookup.
				if (args.includes("resolve-activity")) {
					return Buffer.from("com.example.app/.MainActivity\n");
				}

				return Buffer.from("");
			};

			robot.adb = record;
			robot.silentAdb = record;
			return { robot, calls };
		};

		test("should use monkey when no launch args are supplied", async () => {
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app");
			expect(calls).toEqual([
				["shell", "monkey", "-p", "com.example.app", "-c", "android.intent.category.LAUNCHER", "1"],
			]);
		});

		test("should use monkey when an empty launch args map is supplied", async () => {
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app", undefined, {});
			expect(calls).toEqual([
				["shell", "monkey", "-p", "com.example.app", "-c", "android.intent.category.LAUNCHER", "1"],
			]);
		});

		test("should use am start with resolved activity and extras when launch args are supplied", async () => {
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app", undefined, { FeatureXEnabled: "true", server: "staging" });

			expect(calls).toEqual([
				["shell", "cmd", "package", "resolve-activity", "--brief", "-c", "android.intent.category.LAUNCHER", "com.example.app"],
				[
					"shell", "am", "start", "-n", "com.example.app/.MainActivity",
					"--es", "FeatureXEnabled", "'true'",
					"--es", "server", "'staging'",
				],
			]);
		});

		test("should quote every extra as one remote-shell argument", async () => {
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app", undefined, {
				spaces: "value with spaces",
				apostrophe: "it's enabled",
				json: "{\"enabled\":true}",
				empty: "",
				url: "https://example.test?a=1&b=2",
				literal: "$(literal); `text`",
			});

			expect(calls[1]).toEqual([
				"shell", "am", "start", "-n", "com.example.app/.MainActivity",
				"--es", "spaces", "'value with spaces'",
				"--es", "apostrophe", "'it'\\''s enabled'",
				"--es", "json", "'{\"enabled\":true}'",
				"--es", "empty", "''",
				"--es", "url", "'https://example.test?a=1&b=2'",
				"--es", "literal", "'$(literal); `text`'",
			]);
		});

		test("should preserve launch values through a POSIX shell boundary", async () => {
			const values = {
				newline: "first\nsecond",
				tab: "left\tright",
				backslash: String.raw`C:\path\file`,
				unicode: "\u4F60\u597D\u4E16\u754C",
			};
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app", undefined, values);

			const launchCommand = calls[1];
			for (let index = 5; index < launchCommand.length; index += 3) {
				const key = launchCommand[index + 1] as keyof typeof values;
				const quotedValue = launchCommand[index + 2];
				const output = execFileSync("/bin/sh", ["-c", `printf %s ${quotedValue}`], { encoding: "utf8" });
				expect(output).toBe(values[key]);
			}
		});

		test("should validate all inputs before changing locale", async () => {
			const { robot, calls } = createRobot();
			await expect(robot.launchApp("com.example.app", "fr-FR", { "bad key": "value" })).rejects.toThrow(ActionableError);
			expect(calls).toEqual([]);
		});

		test("should reject NUL launch args before shelling out", async () => {
			const { robot, calls } = createRobot();
			await expect(robot.launchApp("com.example.app", undefined, { key: "before\0after" })).rejects.toThrow(ActionableError);
			expect(calls).toEqual([]);
		});

		test("should reject malformed launcher resolution output", async () => {
			const { robot, calls } = createRobot();
			robot.adb = (...args: string[]): Buffer => {
				calls.push(args);
				return Buffer.from("diagnostic: see /tmp/device.log\n");
			};

			await expect(robot.launchApp("com.example.app", undefined, { key: "value" }))
				.rejects.toThrow("Could not resolve a launchable activity");
			expect(calls).toHaveLength(1);
		});

		test("should surface launcher resolution command diagnostics", async () => {
			const { robot, calls } = createRobot();
			robot.adb = (...args: string[]): Buffer => {
				calls.push(args);
				throw Object.assign(new Error("resolve failed"), {
					stderr: Buffer.from("device offline"),
				});
			};

			await expect(robot.launchApp("com.example.app", undefined, { key: "value" }))
				.rejects.toThrow("device offline");
			expect(calls).toHaveLength(1);
		});

		test("should surface am start command diagnostics", async () => {
			const { robot, calls } = createRobot();
			robot.silentAdb = (...args: string[]): Buffer => {
				calls.push(args);
				throw Object.assign(new Error("launch failed"), {
					stderr: Buffer.from("permission denied"),
				});
			};

			await expect(robot.launchApp("com.example.app", undefined, { key: "value" }))
				.rejects.toThrow("permission denied");
		});
	});

	test.describe("IosRobot.launchApp", () => {
		const createRobot = (): {
			robot: IosRobot;
			calls: string[][];
			getTunnelChecks: () => number;
		} => {
			const robot = new IosRobot("physical-device");
			const calls: string[][] = [];
			let tunnelChecks = 0;
			const internals = robot as unknown as {
				assertTunnelRunning: () => Promise<void>;
				ios: (...args: string[]) => Promise<string>;
			};
			internals.assertTunnelRunning = async () => {
				tunnelChecks += 1;
			};
			internals.ios = async (...args: string[]) => {
				calls.push(args);
				return "";
			};
			return { robot, calls, getTunnelChecks: () => tunnelChecks };
		};

		test("should pass locale and raw launch values through go-ios argv", async () => {
			const { robot, calls } = createRobot();
			await robot.launchApp("com.example.app", "fr-FR,en-GB", {
				feature: "it's enabled",
				config: "{\"url\":\"https://example.test?a=1&b=2\"}",
			});

			expect(calls).toEqual([[
				"launch", "com.example.app",
				"--arg=-AppleLanguages", "--arg=(fr-FR, en-GB)",
				"--arg=-AppleLocale", "--arg=fr-FR",
				"--arg=-feature", "--arg=it's enabled",
				"--arg=-config", "--arg={\"url\":\"https://example.test?a=1&b=2\"}",
			]]);
		});

		test("should validate launch args before checking the device tunnel", async () => {
			const { robot, calls, getTunnelChecks } = createRobot();
			await expect(robot.launchApp("com.example.app", undefined, { "bad key": "value" })).rejects.toThrow(ActionableError);
			expect(getTunnelChecks()).toBe(0);
			expect(calls).toEqual([]);
		});
	});

	test.describe("Simctl.launchApp", () => {
		test("should pass locale and raw launch values through simctl argv", async () => {
			const simulator = new Simctl("simulator-id");
			const calls: string[][] = [];
			const internals = simulator as unknown as {
				simctl: (...args: string[]) => Buffer;
			};
			internals.simctl = (...args: string[]) => {
				calls.push(args);
				return Buffer.from("");
			};

			await simulator.launchApp("com.example.app", "fr-FR,en-GB", {
				feature: "it's enabled",
				config: "{\"url\":\"https://example.test?a=1&b=2\"}",
			});

			expect(calls).toEqual([[
				"launch", "simulator-id", "com.example.app",
				"-AppleLanguages", "(fr-FR, en-GB)",
				"-AppleLocale", "fr-FR",
				"-feature", "it's enabled",
				"-config", "{\"url\":\"https://example.test?a=1&b=2\"}",
			]]);
		});
	});

	test.describe("MobileDevice.launchApp", () => {
		const createDevice = (): {
			device: MobileDevice;
			mobilecliCalls: string[][];
			simctlCalls: Array<[string, string | undefined, Record<string, string> | undefined]>;
		} => {
			const device = new MobileDevice("simulator-id");
			const mobilecliCalls: string[][] = [];
			const simctlCalls: Array<[string, string | undefined, Record<string, string> | undefined]> = [];
			const internals = device as unknown as {
				mobilecli: { executeCommand: (args: string[]) => string };
				simctl: { launchApp: (packageName: string, locale?: string, launchArgs?: Record<string, string>) => Promise<void> };
			};
			internals.mobilecli = {
				executeCommand: (args: string[]) => {
					mobilecliCalls.push(args);
					return "";
				},
			};
			internals.simctl = {
				launchApp: async (packageName, locale, launchArgs) => {
					simctlCalls.push([packageName, locale, launchArgs]);
				},
			};
			return { device, mobilecliCalls, simctlCalls };
		};

		test("should retain mobilecli for launches without arguments", async () => {
			const { device, mobilecliCalls, simctlCalls } = createDevice();
			await device.launchApp("com.example.app", "fr-FR");
			expect(mobilecliCalls).toEqual([
				["apps", "launch", "com.example.app", "--locale", "fr-FR", "--device", "simulator-id"],
			]);
			expect(simctlCalls).toEqual([]);
		});

		test("should retain mobilecli for an empty argument map", async () => {
			const { device, mobilecliCalls, simctlCalls } = createDevice();
			await device.launchApp("com.example.app", undefined, {});
			expect(mobilecliCalls).toEqual([
				["apps", "launch", "com.example.app", "--device", "simulator-id"],
			]);
			expect(simctlCalls).toEqual([]);
		});

		test("should delegate non-empty launch arguments to Simctl", async () => {
			const { device, mobilecliCalls, simctlCalls } = createDevice();
			const launchArgs = { feature: "it's enabled" };
			await device.launchApp("com.example.app", "fr-FR", launchArgs);
			expect(simctlCalls).toEqual([
				["com.example.app", "fr-FR", launchArgs],
			]);
			expect(mobilecliCalls).toEqual([]);
		});
	});

	test("should accept and forward launch arguments through the MCP boundary", async () => {
		const launchCalls: Array<[string, string | undefined, Record<string, string> | undefined]> = [];
		const resolvedDevices: string[] = [];
		const robot = {
			launchApp: async (packageName: string, locale?: string, launchArgs?: Record<string, string>) => {
				launchCalls.push([packageName, locale, launchArgs]);
			},
		} as unknown as Robot;
		const previousTelemetry = process.env.MOBILEMCP_DISABLE_TELEMETRY;
		process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
		const server = createMcpServer({
			getRobotFromDevice: device => {
				resolvedDevices.push(device);
				return robot;
			},
		});
		const client = new Client({ name: "launch-args-test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const result = await client.callTool({
				name: "mobile_launch_app",
				arguments: {
					device: "simulator-id",
					packageName: "com.example.app",
					locale: "fr-FR",
					launchArgs: {
						feature: "it's enabled",
						config: "{\"url\":\"https://example.test?a=1&b=2\"}",
					},
				},
			});

			expect(resolvedDevices).toEqual(["simulator-id"]);
			expect(launchCalls).toEqual([[
				"com.example.app",
				"fr-FR",
				{
					feature: "it's enabled",
					config: "{\"url\":\"https://example.test?a=1&b=2\"}",
				},
			]]);
			expect(result.content).toEqual([
				{ type: "text", text: "Launched app com.example.app" },
			]);
		} finally {
			await client.close();
			await server.close();
			if (previousTelemetry === undefined) {
				delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
			} else {
				process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetry;
			}
		}
	});

	test("should reject invalid launch arguments before resolving the device", async () => {
		let resolverCalls = 0;
		const previousTelemetry = process.env.MOBILEMCP_DISABLE_TELEMETRY;
		process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
		const server = createMcpServer({
			getRobotFromDevice: () => {
				resolverCalls += 1;
				throw new Error("device resolver should not be called");
			},
		});
		const client = new Client({ name: "launch-args-validation-test", version: "1.0.0" });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const result = await client.callTool({
				name: "mobile_launch_app",
				arguments: {
					device: "simulator-id",
					packageName: "com.example.app",
					launchArgs: { "bad key": "value" },
				},
			});

			expect(resolverCalls).toBe(0);
			expect(result.content).toEqual([{
				type: "text",
				text: "Invalid launch argument key: \"bad key\". Please fix the issue and try again.",
			}]);
		} finally {
			await client.close();
			await server.close();
			if (previousTelemetry === undefined) {
				delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
			} else {
				process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetry;
			}
		}
	});
});

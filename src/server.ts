import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ChildProcess } from "node:child_process";

import { error, trace } from "./logger";
import { AndroidRobot, AndroidDeviceManager } from "./android";
import { ActionableError, Robot, ScreenshotOptions } from "./robot";
import { IosManager, IosRobot } from "./ios";
import { PNG } from "./png";
import { Mobilecli } from "./mobilecli";
import { MobileDevice } from "./mobile-device";
import { validateOutputPath, validateFileExtension } from "./utils";

const ALLOWED_LOG_EXTENSIONS = [".log", ".txt", ".jsonl"];
const DEFAULT_DEVICE_LOG_ENTRIES = 100;
const MAX_DEVICE_LOG_ENTRIES = 10000;
const DEVICE_LOG_TIMEOUT_MS = 30000;
const DEVICE_LOG_FILTER_PATTERN = /^(pid|process|tag|level|subsystem|category|message)!?=.+$/;
const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const DEFAULT_SCREENSHOT_MAX_SIZE = 1024;
const ALLOWED_RECORDING_EXTENSIONS = [".mp4"];
const LOGIN_PROMPT_TIMEOUT_MS = 15000;

interface MobilecliDevice {
	id: string;
	name: string;
	platform: "android" | "ios";
	type: "real" | "emulator" | "simulator";
	version: string;
	state: "online" | "offline";
}

interface MobilecliDevicesResponse {
	devices: MobilecliDevice[];
}

interface ActiveRecording {
	process: ChildProcess;
	outputPath: string;
	startedAt: number;
}

export const getAgentVersion = (): string => {
	const json = require("../package.json");
	return json.version;
};

export const createMcpServer = (): McpServer => {

	const server = new McpServer({
		name: "mobile-mcp",
		version: getAgentVersion(),
	});


	const getClientName = (): string => {
		try {
			const clientInfo = server.server.getClientVersion();
			const clientName = clientInfo?.name || "unknown";
			return clientName;
		} catch (error: any) {
			return "unknown";
		}
	};

	type ZodSchemaShape = Record<string, z.ZodType>;

	interface ToolAnnotations {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		openWorldHint?: boolean;
	}

	const tool = (name: string, title: string, description: string, paramsSchema: ZodSchemaShape, annotations: ToolAnnotations, cb: (args: any, telemetry: Record<string, string | number>) => Promise<string>) => {
		server.registerTool(name, {
			title,
			description,
			inputSchema: paramsSchema,
			annotations,
		}, (async (args: any, _extra: any) => {
			try {
				trace(`Invoking ${name} with args: ${JSON.stringify(args)}`);
				const start = +new Date();
				const telemetry: Record<string, string | number> = {};
				const response = await cb(args, telemetry);
				const duration = +new Date() - start;
				trace(`=> ${response}`);
				posthog("tool_invoked", { "ToolName": name, "Duration": duration, ...telemetry }).then();
				return {
					content: [{ type: "text", text: response }],
				};
			} catch (error: any) {
				posthog("tool_failed", { "ToolName": name }).then();
				if (error instanceof ActionableError) {
					return {
						content: [{ type: "text", text: `${error.message}. Please fix the issue and try again.` }],
					};
				} else {
					// a real exception
					trace(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
						isError: true,
					};
				}
			}
		}) as any);
	};

	const posthog = async (event: string, properties: Record<string, string | number>) => {
		if (process.env.MOBILEMCP_DISABLE_TELEMETRY) {
			return;
		}

		try {
			const url = "https://us.i.posthog.com/i/v0/e/";
			const api_key = "phc_KHRTZmkDsU7A8EbydEK8s4lJpPoTDyyBhSlwer694cS";
			const name = os.hostname() + process.execPath;
			const distinct_id = crypto.createHash("sha256").update(name).digest("hex");
			const systemProps: any = {
				Platform: os.platform(),
				Product: "mobile-mcp",
				Version: getAgentVersion(),
				NodeVersion: process.version,
				CI: process.env.CI || "0",
				RobotMode: process.env.MOBILEMCP_LEGACY_ROBOT === "1" ? "legacy" : "mobilecli",
			};

			const clientName = getClientName();
			if (clientName !== "unknown") {
				systemProps.AgentName = clientName;
			}

			await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					api_key,
					event,
					properties: {
						...systemProps,
						...properties,
					},
					distinct_id,
				})
			});
		} catch (err: any) {
			// ignore
		}
	};

	const mobilecli = new Mobilecli();
	const activeRecordings = new Map<string, ActiveRecording>();
	const agentVerifiedSimulators = new Set<string>();
	const activeLoginProcesses: ChildProcess[] = [];
	posthog("launch", {}).then();

	const ensureMobilecliAvailable = (): void => {
		try {
			const version = mobilecli.getVersion();
			if (version.startsWith("failed")) {
				throw new Error("mobilecli version check failed");
			}
		} catch (error: any) {
			throw new ActionableError(`mobilecli is not available or not working properly. Please review the documentation at https://github.com/mobile-next/mobile-mcp/wiki for installation instructions`);
		}
	};

	const getRobotFromDevice = (deviceId: string): Robot => {

		// from now on, we must have mobilecli working
		ensureMobilecliAvailable();

		const legacyRobot = process.env.MOBILEMCP_LEGACY_ROBOT === "1";
		if (legacyRobot) {
			// Check if it's an iOS device
			const iosManager = new IosManager();
			const iosDevices = iosManager.listDevices();
			const iosDevice = iosDevices.find(d => d.deviceId === deviceId);
			if (iosDevice) {
				return new IosRobot(deviceId);
			}

			// Check if it's an Android device
			const androidManager = new AndroidDeviceManager();
			const androidDevices = androidManager.getConnectedDevices();
			const androidDevice = androidDevices.find(d => d.deviceId === deviceId);
			if (androidDevice) {
				return new AndroidRobot(deviceId);
			}
		}

		const response = mobilecli.getDevices(legacyRobot ? {
			platform: "ios",
			type: "simulator",
			includeOffline: false,
		} : {
			includeOffline: false,
		});

		if (response.status === "ok" && response.data && response.data.devices) {
			for (const device of response.data.devices) {
				if (device.id === deviceId) {
					if (device.platform === "ios" && device.type === "simulator" && !agentVerifiedSimulators.has(deviceId)) {
						const agentStatus = mobilecli.agentStatus(deviceId);
						if (agentStatus.status === "fail") {
							mobilecli.agentInstall(deviceId);
						}

						agentVerifiedSimulators.add(deviceId);
					}

					return new MobileDevice(deviceId);
				}
			}
		}

		throw new ActionableError(`Device "${deviceId}" not found. Use the mobile_list_available_devices tool to see available devices.`);
	};

	tool(
		"mobile_list_available_devices",
		"List Devices",
		"List all available devices. This includes both physical mobile devices and mobile simulators and emulators. It returns both Android and iOS devices. " +
		"These are local devices already connected to this machine, ready to use immediately at no cost - for devices from the shared remote cloud fleet, use mobile_list_remote_devices instead.",
		{},
		{ readOnlyHint: true, openWorldHint: false },
		async ({}, telemetry) => {

			// from today onward, we must have mobilecli working
			ensureMobilecliAvailable();

			const devices: MobilecliDevice[] = [];
			const legacyRobot = process.env.MOBILEMCP_LEGACY_ROBOT === "1";

			if (legacyRobot) {
				const iosManager = new IosManager();
				const androidManager = new AndroidDeviceManager();

				// Get Android devices with details
				const androidDevices = androidManager.getConnectedDevicesWithDetails();
				telemetry.AndroidCount = androidDevices.length;
				for (const device of androidDevices) {
					devices.push({
						id: device.deviceId,
						name: device.name,
						platform: "android",
						type: "emulator",
						version: device.version,
						state: "online",
					});
				}

				// Get iOS physical devices with details
				telemetry.IosRealCount = 0;
				try {
					const iosDevices = iosManager.listDevicesWithDetails();
					telemetry.IosRealCount = iosDevices.length;
					for (const device of iosDevices) {
						devices.push({
							id: device.deviceId,
							name: device.deviceName,
							platform: "ios",
							type: "real",
							version: device.version,
							state: "online",
						});
					}
				} catch (error: any) {
					// If go-ios is not available, silently skip
				}

				// Get iOS simulators from mobilecli, including offline ones so we can
				// report how many are installed vs booted. only booted ones are returned.
				const response = mobilecli.getDevices({
					platform: "ios",
					type: "simulator",
					includeOffline: true,
				});
				telemetry.IosSimInstalledCount = 0;
				telemetry.IosSimCount = 0;
				if (response.status === "ok" && response.data && response.data.devices) {
					const simulators = response.data.devices;
					const booted = simulators.filter(device => device.state === "online");
					telemetry.IosSimInstalledCount = simulators.length;
					telemetry.IosSimCount = booted.length;
					devices.push(...booted);
				}
			} else {
				const response = mobilecli.getDevices({ includeOffline: true });
				telemetry.AndroidCount = 0;
				telemetry.IosRealCount = 0;
				telemetry.IosSimInstalledCount = 0;
				telemetry.IosSimCount = 0;
				if (response.status === "ok" && response.data && response.data.devices) {
					const availableDevices = response.data.devices.filter(device => device.state === "online");
					telemetry.AndroidCount = availableDevices.filter(device => device.platform === "android").length;
					telemetry.IosRealCount = availableDevices.filter(device => device.platform === "ios" && device.type === "real").length;
					telemetry.IosSimInstalledCount = response.data.devices.filter(device => device.platform === "ios" && device.type === "simulator").length;
					telemetry.IosSimCount = availableDevices.filter(device => device.platform === "ios" && device.type === "simulator").length;
					devices.push(...availableDevices);
				}
			}

			const out: MobilecliDevicesResponse = { devices };
			return JSON.stringify(out);
		}
	);

	tool(
		"mobile_login_to_cloud_provider",
		"Login to Cloud Provider",
		"Start authenticating this machine with the remote device cloud provider. This is required once before mobile_list_remote_devices or mobile_allocate_remote_device will work; if either of those fails with an authentication error, call this tool and then retry. " +
		"This starts a browser-based device-code login and returns quickly with a URL and a one-time code - it does NOT wait for the login to complete. Show the URL and code to the user verbatim and ask them to open the URL and enter the code in their own browser. " +
		"The login keeps running in the background after this tool returns; once the user confirms they've completed it, retry the remote devices tool that originally failed. " +
		"Only call this after the user has explicitly asked to connect to, log into, or use remote/cloud devices - never call it speculatively, since it interrupts the user to act in their browser.",
		{},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({}) => {
			ensureMobilecliAvailable();

			const child = mobilecli.spawnRemoteLogin();
			activeLoginProcesses.push(child);

			const forget = () => {
				const index = activeLoginProcesses.indexOf(child);
				if (index !== -1) {
					activeLoginProcesses.splice(index, 1);
				}
			};

			return new Promise<string>((resolve, reject) => {
				let output = "";
				let settled = false;

				const promptTimeout = setTimeout(() => {
					if (!settled) {
						settled = true;
						forget();
						child.kill();
						reject(new ActionableError(`Timed out waiting for the login prompt from mobilecli. Output so far: ${output.trim() || "(none)"}`));
					}
				}, LOGIN_PROMPT_TIMEOUT_MS);

				child.stdout?.on("data", (chunk: Buffer) => {
					output += chunk.toString();

					if (!settled && output.includes("Waiting for authorization")) {
						settled = true;
						clearTimeout(promptTimeout);

						const urlMatch = output.match(/(https?:\/\/\S+)/);
						const codeMatch = output.match(/enter the code:\s*(\S+)/i);

						if (urlMatch && codeMatch) {
							resolve(`Authentication to mobilenext.ai started, please open ${urlMatch[1]} and enter the code: ${codeMatch[1]}`);
						} else {
							resolve(`Authentication started, please check the output: ${output.trim()}`);
						}
					}
				});

				child.stderr?.on("data", (chunk: Buffer) => {
					output += chunk.toString();
				});

				child.on("error", (err: Error) => {
					forget();
					if (!settled) {
						settled = true;
						clearTimeout(promptTimeout);
						reject(new ActionableError(`Failed to start login: ${err.message}`));
					}
				});

				child.on("exit", (code: number | null) => {
					forget();
					if (!settled) {
						settled = true;
						clearTimeout(promptTimeout);
						reject(new ActionableError(`mobilecli auth login exited early (code ${code}). Output: ${output.trim() || "(none)"}`));
					}
				});
			});
		}
	);

	tool(
		"mobile_list_remote_devices",
		"List Remote Devices",
		"List the catalog of device models (make, platform, OS version) available to reserve from the remote cloud device fleet. " +
		"This is different from mobile_list_available_devices, which lists real devices and simulators/emulators already connected to this local machine and ready to use immediately at no cost. " +
		"Remote devices live in a shared cloud fleet: they are not usable until reserved with mobile_allocate_remote_device, and reserving one may be a limited/billed resource. " +
		"Requires mobile_login_to_cloud_provider to have been called first; if this fails with an authentication error, call that tool then retry.",
		{},
		{ readOnlyHint: true, openWorldHint: true },
		async ({}) => {
			ensureMobilecliAvailable();
			const result = mobilecli.remoteListDevices();
			return result;
		}
	);

	tool(
		"mobile_allocate_remote_device",
		"Allocate Remote Device",
		"Reserve a physical device from the remote cloud fleet for exclusive use, returning a device identifier usable with the other mobile_* tools. " +
		"Unlike local devices, a remote device is a shared and billed resource borrowed for the session - only call this after the user has explicitly asked to use a remote/cloud device, never speculatively or as a fallback when a local device isn't found. " +
		"Requires mobile_login_to_cloud_provider to have been called first; if this fails with an authentication error, call that tool then retry. " +
		"Use mobile_list_remote_devices first to see which names and versions actually exist in the fleet before filtering by them. " +
		"Release the device with mobile_release_remote_device once the whole task is finished - releasing wipes the device's state, so do not release and reallocate between steps of the same task just to be tidy.",
		{
			platform: z.enum(["ios", "android"]).describe("The platform to allocate a device for"),
			name: z.string().optional().describe("Filter by device name/model. Supports a trailing * for prefix match (e.g. \"iPhone*\"), or an exact name (e.g. \"iPhone 16\")."),
			version: z.array(z.string()).optional().describe("Filter by OS version. Supports comparison prefixes >=, >, <=, < (e.g. \">=18\"), or an exact version (e.g. \"18.6.2\"). Multiple values are ANDed together."),
			type: z.enum(["real"]).optional().describe("Device type filter. Currently only \"real\" (physical devices) is supported by the fleet."),
			wait: z.boolean().optional().describe("If true, block until the device has finished allocating and is ready to use, up to timeoutSeconds. If false/omitted, this returns as soon as the reservation is made, but the device may not be immediately ready."),
			timeoutSeconds: z.coerce.number().int().positive().optional().describe("Seconds to wait for allocation when wait is true. Defaults to 900 (15 minutes). Only relevant when wait is true."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ platform, name, version, type, wait, timeoutSeconds }) => {
			ensureMobilecliAvailable();
			const result = mobilecli.remoteAllocate({ platform, name, version, type, wait, timeoutSeconds });
			return result;
		}
	);

	tool(
		"mobile_release_remote_device",
		"Release Remote Device",
		"Release a device previously reserved with mobile_allocate_remote_device back to the remote cloud fleet so it becomes available to others. " +
		"Releasing is destructive to the device's state: apps installed, files pushed, and any other changes made during this session are lost, and a later mobile_allocate_remote_device call may take time and could return a different physical unit. " +
		"Only release once the whole task is finished - if there is more work to do on the same device shortly, keep holding it rather than releasing and reallocating.",
		{
			device: z.string().describe("The device identifier to release back to the remote fleet"),
		},
		{ readOnlyHint: false, destructiveHint: true, openWorldHint: true },
		async ({ device }) => {
			ensureMobilecliAvailable();
			const result = mobilecli.remoteRelease(device);
			return result;
		}
	);

	tool(
		"mobile_list_apps",
		"List Apps",
		"List all the installed apps on the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true, openWorldHint: false },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const result = await robot.listApps();
			return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
		}
	);

	tool(
		"mobile_get_foreground_app",
		"Get Foreground App",
		"Get the app currently in the foreground on the device. Use this to verify which app or screen you are on before interacting with it.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true, openWorldHint: false },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			if (!robot.getForegroundApp) {
				throw new ActionableError("Getting the foreground app is not supported in legacy robot mode");
			}

			const app = await robot.getForegroundApp();
			return `Foreground app: ${app.appName} (${app.packageName})`;
		}
	);

	tool(
		"mobile_launch_app",
		"Launch App",
		"Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			packageName: z.string().describe("The package name of the app to launch"),
			locale: z.string().optional().describe("Comma-separated BCP 47 locale tags to launch the app with (e.g., fr-FR,en-GB)"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, packageName, locale }) => {
			const robot = getRobotFromDevice(device);
			await robot.launchApp(packageName, locale);
			return `Launched app ${packageName}`;
		}
	);

	tool(
		"mobile_terminate_app",
		"Terminate App",
		"Stop and terminate an app on mobile device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			packageName: z.string().describe("The package name of the app to terminate"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, packageName }) => {
			const robot = getRobotFromDevice(device);
			await robot.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"mobile_install_app",
		"Install App",
		"Install an app on mobile device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			path: z.string().describe("The path to the app file to install. For iOS simulators, provide a .zip file or a .app directory. For Android provide an .apk file. For iOS real devices provide an .ipa file"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, path }) => {
			const robot = getRobotFromDevice(device);
			await robot.installApp(path);
			return `Installed app from ${path}`;
		}
	);

	tool(
		"mobile_uninstall_app",
		"Uninstall App",
		"Uninstall an app from mobile device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			bundle_id: z.string().describe("Bundle identifier (iOS) or package name (Android) of the app to be uninstalled"),
		},
		{ readOnlyHint: false, destructiveHint: true, openWorldHint: false },
		async ({ device, bundle_id }) => {
			const robot = getRobotFromDevice(device);
			await robot.uninstallApp(bundle_id);
			return `Uninstalled app ${bundle_id}`;
		}
	);

	tool(
		"mobile_get_screen_size",
		"Get Screen Size",
		"Get the screen size of the mobile device in pixels",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true, openWorldHint: false },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const screenSize = await robot.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	tool(
		"mobile_click_on_screen_at_coordinates",
		"Click Screen",
		"Click on the screen at given x,y coordinates. If clicking on an element, use the list_elements_on_screen tool to find the coordinates.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			x: z.coerce.number().describe("The x coordinate to click on the screen, in pixels"),
			y: z.coerce.number().describe("The y coordinate to click on the screen, in pixels"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, x, y }) => {
			const robot = getRobotFromDevice(device);
			await robot.tap(x, y);
			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_double_tap_on_screen",
		"Double Tap Screen",
		"Double-tap on the screen at given x,y coordinates.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			x: z.coerce.number().describe("The x coordinate to double-tap, in pixels"),
			y: z.coerce.number().describe("The y coordinate to double-tap, in pixels"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, x, y }) => {
			const robot = getRobotFromDevice(device);
			await robot!.doubleTap(x, y);
			return `Double-tapped on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_long_press_on_screen_at_coordinates",
		"Long Press Screen",
		"Long press on the screen at given x,y coordinates. If long pressing on an element, use the list_elements_on_screen tool to find the coordinates.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			x: z.coerce.number().describe("The x coordinate to long press on the screen, in pixels"),
			y: z.coerce.number().describe("The y coordinate to long press on the screen, in pixels"),
			duration: z.coerce.number().min(1).max(10000).optional().describe("Duration of the long press in milliseconds. Defaults to 500ms."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, x, y, duration }) => {
			const robot = getRobotFromDevice(device);
			const pressDuration = duration ?? 500;
			await robot.longPress(x, y, pressDuration);
			return `Long pressed on screen at coordinates: ${x}, ${y} for ${pressDuration}ms`;
		}
	);

	tool(
		"mobile_list_elements_on_screen",
		"List Screen Elements",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true, openWorldHint: true },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const elements = await robot.getElementsOnScreen();

			const result = elements.map(element => {
				const out: any = {
					ref: element.ref,
					type: element.type,
					text: element.text,
					label: element.label,
					name: element.name,
					value: element.value,
					identifier: element.identifier,
					coordinates: {
						x: element.rect.x,
						y: element.rect.y,
						width: element.rect.width,
						height: element.rect.height,
					},
				};

				// only emit non-default states, otherwise don't confuse llm
				if (element.focused) {
					out.focused = true;
				}

				if (element.selected) {
					out.selected = true;
				}

				if (element.checked) {
					out.checked = true;
				}

				if (element.enabled === false) {
					out.enabled = false;
				}

				return out;
			});

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press Button",
		"Press a button on device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			button: z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER, DPAD_CENTER (android tv only), DPAD_UP (android tv only), DPAD_DOWN (android tv only), DPAD_LEFT (android tv only), DPAD_RIGHT (android tv only)"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, button }) => {
			const robot = getRobotFromDevice(device);
			await robot.pressButton(button);
			return `Pressed the button: ${button}`;
		}
	);

	tool(
		"mobile_open_url",
		"Open URL",
		"Open a URL in browser on device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			url: z.string().describe("The URL to open"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, url }) => {
			const allowUnsafeUrls = process.env.MOBILEMCP_ALLOW_UNSAFE_URLS === "1";
			if (!allowUnsafeUrls && !url.startsWith("http://") && !url.startsWith("https://")) {
				throw new ActionableError("Only http:// and https:// URLs are allowed. Set MOBILEMCP_ALLOW_UNSAFE_URLS=1 to allow other URL schemes.");
			}

			const robot = getRobotFromDevice(device);
			await robot.openUrl(url);
			return `Opened URL: ${url}`;
		}
	);

	tool(
		"mobile_swipe_on_screen",
		"Swipe Screen",
		"Swipe on the screen",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			direction: z.enum(["up", "down", "left", "right"]).describe("The direction to swipe"),
			x: z.coerce.number().optional().describe("The x coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
			y: z.coerce.number().optional().describe("The y coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
			distance: z.coerce.number().optional().describe("The distance to swipe in pixels. Defaults to 400 pixels for iOS or 30% of screen dimension for Android"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, direction, x, y, distance }) => {
			const robot = getRobotFromDevice(device);

			if (x !== undefined && y !== undefined) {
				// Use coordinate-based swipe
				await robot.swipeFromCoordinate(x, y, direction, distance);
				const distanceText = distance ? ` ${distance} pixels` : "";
				return `Swiped ${direction}${distanceText} from coordinates: ${x}, ${y}`;
			} else {
				// Use center-based swipe
				await robot.swipe(direction);
				return `Swiped ${direction} on screen`;
			}
		}
	);

	tool(
		"mobile_type_keys",
		"Type Text",
		"Type text into the focused element",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			text: z.string().describe("The text to type"),
			submit: z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		async ({ device, text, submit }) => {
			const robot = getRobotFromDevice(device);
			await robot.sendKeys(text);

			if (submit) {
				await robot.pressButton("ENTER");
			}

			return `Typed text: ${text}`;
		}
	);

	tool(
		"mobile_save_screenshot",
		"Save Screenshot",
		"Save a screenshot of the mobile device to a file",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			saveTo: z.string().describe("The path to save the screenshot to. Filename must end with .png, .jpg, or .jpeg"),
			maxSize: z.number().int().positive().optional().describe("Maximum width/height in pixels, keeping aspect ratio. Omit for full size."),
			scale: z.number().gt(0).max(1).optional().describe("Scale factor (0.0-1.0). Ignored if maxSize is provided."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, saveTo, maxSize, scale }) => {
			validateFileExtension(saveTo, ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot");
			validateOutputPath(saveTo);

			const robot = getRobotFromDevice(device);

			const format = saveTo.toLowerCase().endsWith(".png") ? "png" : "jpeg";
			const screenshot = await robot.getScreenshot({ format, maxSize, scale });

			// legacy robots ignore the requested format and always return a png
			const isPng = screenshot.length > 0 && screenshot[0] === 0x89;
			if (format === "jpeg" && isPng) {
				throw new ActionableError("This device only supports png screenshots, save to a .png file instead.");
			}

			fs.writeFileSync(saveTo, screenshot);
			return `Screenshot saved to: ${saveTo}`;
		}
	);

	server.registerTool(
		"mobile_take_screenshot",
		{
			title: "Take Screenshot",
			description: "Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
			inputSchema: {
				device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
				maxSize: z.number().int().positive().optional().describe(`Maximum width/height in pixels, keeping aspect ratio. Defaults to ${DEFAULT_SCREENSHOT_MAX_SIZE}.`),
				scale: z.number().gt(0).max(1).optional().describe("Scale factor (0.0-1.0). Ignored if maxSize is provided."),
			},
			annotations: {
				readOnlyHint: true,
				openWorldHint: true,
			},
		},
		async ({ device, maxSize, scale }) => {
			try {
				const robot = getRobotFromDevice(device);

				// mobilecli scales and converts natively; legacy robots ignore the options and return a full-size png
				// maxSize wins over scale (same precedence as mobilecli); the default applies only when neither is given
				const options: ScreenshotOptions = { format: "jpeg", quality: 75 };
				if (maxSize !== undefined) {
					options.maxSize = maxSize;
				} else if (scale !== undefined) {
					options.scale = scale;
				} else {
					options.maxSize = DEFAULT_SCREENSHOT_MAX_SIZE;
				}

				const screenshot = await robot.getScreenshot(options);

				const isJpeg = screenshot.length > 2 && screenshot[0] === 0xff && screenshot[1] === 0xd8;
				let mimeType = "image/jpeg";
				if (!isJpeg) {
					mimeType = "image/png";

					// validate we received a png, will throw exception otherwise
					const image = new PNG(screenshot);
					const pngSize = image.getDimensions();
					if (pngSize.width <= 0 || pngSize.height <= 0) {
						throw new ActionableError("Screenshot is invalid. Please try again.");
					}

				}

				const screenshot64 = screenshot.toString("base64");
				trace(`Screenshot taken: ${screenshot.length} bytes`);
				posthog("tool_invoked", {
					"ToolName": "mobile_take_screenshot",
					"ScreenshotFilesize": screenshot64.length,
					"ScreenshotMimeType": mimeType,
				}).then();

				return {
					content: [{ type: "image", data: screenshot64, mimeType }]
				};
			} catch (err: any) {
				error(`Error taking screenshot: ${err.message} ${err.stack}`);
				return {
					content: [{ type: "text", text: `Error: ${err.message}` }],
					isError: true,
				};
			}
		}
	);

	tool(
		"mobile_set_orientation",
		"Set Orientation",
		"Change the screen orientation of the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			orientation: z.enum(["portrait", "landscape"]).describe("The desired orientation"),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, orientation }) => {
			const robot = getRobotFromDevice(device);
			await robot.setOrientation(orientation);
			return `Changed device orientation to ${orientation}`;
		}
	);

	tool(
		"mobile_set_location",
		"Set Location",
		"Override the GPS location reported by the device, or clear the override to restore the real location. Omit latitude and longitude to clear.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			latitude: z.number().min(-90).max(90).optional().describe("Latitude in decimal degrees, e.g. 37.7749. Omit together with longitude to clear the override."),
			longitude: z.number().min(-180).max(180).optional().describe("Longitude in decimal degrees, e.g. -122.4194. Omit together with latitude to clear the override."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, latitude, longitude }) => {
			const robot = getRobotFromDevice(device);
			if (!robot.setLocation || !robot.clearLocation) {
				throw new ActionableError("Setting location is not supported in legacy robot mode");
			}

			if (latitude === undefined && longitude === undefined) {
				await robot.clearLocation();
				return "Cleared location override";
			}

			if (latitude === undefined || longitude === undefined) {
				throw new ActionableError("Both latitude and longitude are required to set a location");
			}

			await robot.setLocation(latitude, longitude);
			return `Set device location to ${latitude},${longitude}`;
		}
	);

	tool(
		"mobile_clipboard",
		"Clipboard",
		"Read or replace the device clipboard. Pass text to set the clipboard, omit it to read the current clipboard.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			text: z.string().optional().describe("Text to place on the clipboard. Omit to read the clipboard instead."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, text }) => {
			const robot = getRobotFromDevice(device);
			if (!robot.getClipboard || !robot.setClipboard) {
				throw new ActionableError("Clipboard is not supported in legacy robot mode");
			}

			if (text === undefined) {
				return await robot.getClipboard();
			}

			await robot.setClipboard(text);
			return "Clipboard updated";
		}
	);

	tool(
		"mobile_get_device_logs",
		"Get Device Logs",
		"Collect live device logs (logcat on Android, unified log on iOS) as one JSON object per line. Only logs emitted after the call starts are captured, so trigger the behavior you want to observe right before or during the call. Stops after `limit` entries or after 30 seconds of silence. Each line of a stack trace counts as one entry, so filter by process or tag to avoid filling the limit with noise. Start with a small limit (20-50) for a quick look. For large captures, pass `saveTo` to write logs to a file and only the entry count is returned.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			limit: z.number().int().min(1).max(MAX_DEVICE_LOG_ENTRIES).default(DEFAULT_DEVICE_LOG_ENTRIES).describe("Stop after this many log entries"),
			filter: z.array(z.string().regex(DEVICE_LOG_FILTER_PATTERN, "Filter must be key=value or key!=value with key in: pid, process, tag, level, subsystem, category, message")).default([]).describe("Filters, ANDed together. key=value includes, key!=value excludes. Keys: pid, process, tag, level, subsystem, category, message. Example: [\"tag=ActivityManager\", \"level=Error\", \"process!=SpringBoard\"]"),
			saveTo: z.string().optional().describe("Path to write the logs to instead of returning them. Filename must end with .log, .txt, or .jsonl"),
		},
		{ readOnlyHint: true, openWorldHint: true },
		async ({ device, limit, filter, saveTo }) => {
			if (saveTo) {
				validateFileExtension(saveTo, ALLOWED_LOG_EXTENSIONS, "get_device_logs");
				validateOutputPath(saveTo);
			}

			const robot = getRobotFromDevice(device);
			if (!robot.getLogs) {
				throw new ActionableError("Device logs are not supported in legacy robot mode");
			}

			const logs = await robot.getLogs(limit, filter, DEVICE_LOG_TIMEOUT_MS);
			if (!saveTo) {
				return logs || "No log entries received";
			}

			fs.writeFileSync(saveTo, logs + "\n");
			const lineCount = logs ? logs.split("\n").length : 0;
			return `Saved ${lineCount} log entries to: ${saveTo}`;
		}
	);

	tool(
		"mobile_get_orientation",
		"Get Orientation",
		"Get the current screen orientation of the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true, openWorldHint: false },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const orientation = await robot.getOrientation();
			return `Current device orientation is ${orientation}`;
		}
	);

	tool(
		"mobile_start_screen_recording",
		"Start Screen Recording",
		"Start recording the screen of a mobile device. The recording runs in the background until stopped with mobile_stop_screen_recording. Returns the path where the recording will be saved.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			output: z.string().optional().describe("The file path to save the recording to. Filename must end with .mp4. If not provided, a temporary path will be used."),
			timeLimit: z.coerce.number().optional().describe("Maximum recording duration in seconds. The recording will stop automatically after this time."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device, output, timeLimit }) => {
			if (output) {
				validateFileExtension(output, ALLOWED_RECORDING_EXTENSIONS, "start_screen_recording");
				validateOutputPath(output);
			}

			getRobotFromDevice(device);

			if (activeRecordings.has(device)) {
				throw new ActionableError(`Device "${device}" is already being recorded. Stop the current recording first with mobile_stop_screen_recording.`);
			}

			const outputPath = output || path.join(os.tmpdir(), `screen-recording-${Date.now()}.mp4`);

			const args = ["screenrecord", "--device", device, "--output", outputPath, "--silent"];
			if (timeLimit !== undefined) {
				args.push("--time-limit", String(timeLimit));
			}

			const child = mobilecli.spawnCommand(args);

			const cleanup = () => {
				activeRecordings.delete(device);
			};

			child.on("error", cleanup);
			child.on("exit", cleanup);

			activeRecordings.set(device, {
				process: child,
				outputPath,
				startedAt: Date.now(),
			});

			return `Screen recording started. Output will be saved to: ${outputPath}`;
		}
	);

	tool(
		"mobile_stop_screen_recording",
		"Stop Screen Recording",
		"Stop an active screen recording on a mobile device. Returns the file path, size, and approximate duration of the recording.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
		},
		{ readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		async ({ device }) => {
			const recording = activeRecordings.get(device);
			if (!recording) {
				throw new ActionableError(`No active recording found for device "${device}". Start a recording first with mobile_start_screen_recording.`);
			}

			const { process: child, outputPath, startedAt } = recording;
			activeRecordings.delete(device);

			child.kill("SIGINT");

			await new Promise<void>(resolve => {
				const timeout = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 5 * 60 * 1000);

				child.on("close", () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			const durationSeconds = Math.round((Date.now() - startedAt) / 1000);

			if (!fs.existsSync(outputPath)) {
				return `Recording stopped after ~${durationSeconds}s but the output file was not found at: ${outputPath}`;
			}

			const stats = fs.statSync(outputPath);
			const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

			return `Recording stopped. File: ${outputPath} (${fileSizeMB} MB, ~${durationSeconds}s)`;
		}
	);

	tool(
		"mobile_list_crashes",
		"List Crash Reports",
		"List crash reports available on the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
		},
		{ readOnlyHint: true, openWorldHint: true },
		async ({ device }) => {
			ensureMobilecliAvailable();
			const response = mobilecli.crashesList(device);
			return JSON.stringify(response.data);
		}
	);

	tool(
		"mobile_get_crash",
		"Get Crash Report",
		"Get the full content of a crash report by its ID. Use mobile_list_crashes to find available crash IDs.",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			id: z.string().describe("The crash report ID to retrieve"),
		},
		{ readOnlyHint: true, openWorldHint: true },
		async ({ device, id }) => {
			ensureMobilecliAvailable();
			const response = mobilecli.crashesGet(device, id);
			return response.data.content;
		}
	);

	return server;
};

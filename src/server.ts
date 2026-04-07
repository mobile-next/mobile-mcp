import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ChildProcess } from "node:child_process";

import { error, trace } from "./logger";
import { AndroidRobot, AndroidDeviceManager } from "./android";
import { ActionableError, Robot } from "./robot";
import { IosManager, IosRobot } from "./ios";
import { PNG } from "./png";
import { isScalingAvailable, Image } from "./image-utils";
import { Mobilecli } from "./mobilecli";
import { MobileDevice } from "./mobile-device";
import { validateOutputPath, validateFileExtension } from "./utils";

const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const ALLOWED_RECORDING_EXTENSIONS = [".mp4"];

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
	}

	const tool = (name: string, title: string, description: string, paramsSchema: ZodSchemaShape, annotations: ToolAnnotations, cb: (args: any) => Promise<string>) => {
		server.registerTool(name, {
			title,
			description,
			inputSchema: paramsSchema,
			annotations,
		}, (async (args: any, _extra: any) => {
			try {
				trace(`Invoking ${name} with args: ${JSON.stringify(args)}`);
				const start = +new Date();
				const response = await cb(args);
				const duration = +new Date() - start;
				trace(`=> ${response}`);
				posthog("tool_invoked", { "ToolName": name, "Duration": duration }).then();
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

		// Check if it's a simulator (will later replace all other device types as well)
		const response = mobilecli.getDevices({
			platform: "ios",
			type: "simulator",
			includeOffline: false,
		});

		if (response.status === "ok" && response.data && response.data.devices) {
			for (const device of response.data.devices) {
				if (device.id === deviceId) {
					return new MobileDevice(deviceId);
				}
			}
		}

		throw new ActionableError(`Device "${deviceId}" not found. Use the mobile_list_available_devices tool to see available devices.`);
	};

	tool(
		"mobile_list_available_devices",
		"List Devices",
		"List all available devices. This includes both physical mobile devices and mobile simulators and emulators. It returns both Android and iOS devices.",
		{},
		{ readOnlyHint: true },
		async ({}) => {

			// from today onward, we must have mobilecli working
			ensureMobilecliAvailable();

			const iosManager = new IosManager();
			const androidManager = new AndroidDeviceManager();
			const devices: MobilecliDevice[] = [];

			// Get Android devices with details
			const androidDevices = androidManager.getConnectedDevicesWithDetails();
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
			try {
				const iosDevices = iosManager.listDevicesWithDetails();
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

			// Get iOS simulators from mobilecli (excluding offline devices)
			const response = mobilecli.getDevices({
				platform: "ios",
				type: "simulator",
				includeOffline: false,
			});
			if (response.status === "ok" && response.data && response.data.devices) {
				for (const device of response.data.devices) {
					devices.push({
						id: device.id,
						name: device.name,
						platform: device.platform,
						type: device.type,
						version: device.version,
						state: "online",
					});
				}
			}

			const out: MobilecliDevicesResponse = { devices };
			return JSON.stringify(out);
		}
	);


	if (process.env.MOBILEFLEET_ENABLE === "1") {
		tool(
			"mobile_list_fleet_devices",
			"List Fleet Devices",
			"List devices available in the remote fleet",
			{},
			{ readOnlyHint: true },
			async ({}) => {
				ensureMobilecliAvailable();
				const result = mobilecli.fleetListDevices();
				return result;
			}
		);

		tool(
			"mobile_allocate_fleet_device",
			"Allocate Fleet Device",
			"Reserve a device from the remote fleet",
			{
				platform: z.enum(["ios", "android"]).describe("The platform to allocate a device for"),
			},
			{ destructiveHint: true },
			async ({ platform }) => {
				ensureMobilecliAvailable();
				const result = mobilecli.fleetAllocate(platform);
				return result;
			}
		);

		tool(
			"mobile_release_fleet_device",
			"Release Fleet Device",
			"Release a device back to the remote fleet",
			{
				device: z.string().describe("The device identifier to release back to the fleet"),
			},
			{ destructiveHint: true },
			async ({ device }) => {
				ensureMobilecliAvailable();
				const result = mobilecli.fleetRelease(device);
				return result;
			}
		);
	}

	tool(
		"mobile_list_apps",
		"List Apps",
		"List all the installed apps on the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const result = await robot.listApps();
			return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
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
		{ destructiveHint: true },
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
		{ destructiveHint: true },
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
		{ destructiveHint: true },
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
		{ destructiveHint: true },
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
		{ readOnlyHint: true },
		async ({ device }) => {
			const robot = getRobotFromDevice(device);
			const screenSize = await robot.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	const getTag = (element: { type?: string; password?: boolean; editable?: boolean; clickable?: boolean }) => {
		const t = (element.type || "").toLowerCase();
		const isInput = t.includes("edittext") || t.includes("textfield") || t.includes("input") || element.password || element.editable;
		const isButton = t.includes("button") || t.includes("imageview") || element.clickable;
		if (isInput) {
			return "INPUT";
		}
		if (isButton) {
			return "BUTTON";
		}
		return "TEXT";
	};

	const buildElementIds = (elements: Awaited<ReturnType<Robot["getElementsOnScreen"]>>) => {
		// Build TYPE:Label IDs with @N for duplicates
		const counts = new Map<string, number>();
		const result: Array<{ id: string; element: typeof elements[0]; cx: number; cy: number; label: string; tag: string }> = [];

		elements.forEach(element => {
			const cx = Math.round(element.rect.x + element.rect.width / 2);
			const cy = Math.round(element.rect.y + element.rect.height / 2);
			const label = element.text || element.label || element.name || "";
			const tag = getTag(element);
			if (tag === "TEXT" && !label) {
				return; // skip empty unlabeled non-interactive
			}
			const baseId = `${tag}:${label || "Unlabeled"}`;
			const count = (counts.get(baseId) || 0) + 1;
			counts.set(baseId, count);
			result.push({ id: baseId, element, cx, cy, label, tag });
		});

		// Append @N for duplicates
		const seen = new Map<string, number>();
		return result.map(item => {
			const total = counts.get(item.id) || 1;
			if (total > 1) {
				const n = (seen.get(item.id) || 0) + 1;
				seen.set(item.id, n);
				return { ...item, id: `${item.id}@${n}` };
			}
			return item;
		});
	};

	const formatElements = (elements: Awaited<ReturnType<Robot["getElementsOnScreen"]>>) => {
		const items = buildElementIds(elements);
		const lines: string[] = [];
		items.forEach(({ id, element, cx, cy, tag }) => {
			const pwdTag = element.password ? " [PASSWORD]" : "";
			const focusTag = element.focused ? " *FOCUSED*" : "";
			const valueTag = tag === "INPUT" ? ` value="${element.value || ""}"` : "";
			lines.push(`${id}${valueTag}${pwdTag}${focusTag}`);
		});
		return lines.join("\n");
	};

	const findElementByTarget = (elements: Awaited<ReturnType<Robot["getElementsOnScreen"]>>, target: string) => {
		const items = buildElementIds(elements);
		// Exact ID match
		const match = items.find(item => item.id.toLowerCase() === target.toLowerCase());
		if (match) {
			return { cx: match.cx, cy: match.cy, label: match.label, id: match.id };
		}

		// Fallback: partial label match (case-insensitive) with optional type prefix
		const atMatch = target.match(/^(.+)@(\d+)$/);
		let searchText = atMatch ? atMatch[1] : target;
		const matchIndex = atMatch ? parseInt(atMatch[2], 10) : 1;

		let typeFilter: string | null = null;
		const colonMatch = searchText.match(/^(INPUT|BUTTON|TEXT):(.+)$/i);
		if (colonMatch) {
			typeFilter = colonMatch[1].toUpperCase();
			searchText = colonMatch[2];
		}

		let found = 0;
		for (const item of items) {
			if (typeFilter && item.tag !== typeFilter) {
				continue;
			}
			if (item.label.toLowerCase().includes(searchText.toLowerCase())) {
				found++;
				if (found === matchIndex) {
					return { cx: item.cx, cy: item.cy, label: item.label, id: item.id };
				}
			}
		}
		return null;
	};

	const executeAction = async (robot: Robot, action: string) => {
		// Parse action string: "tap Target", "type text", "press BACK", "swipe up", "wait 1000"
		const spaceIdx = action.indexOf(" ");
		const cmd = spaceIdx >= 0 ? action.substring(0, spaceIdx).toLowerCase() : action.toLowerCase();
		const arg = spaceIdx >= 0 ? action.substring(spaceIdx + 1) : "";

		switch (cmd) {
			case "tap": {
				const elements = await robot.getElementsOnScreen();
				const target = findElementByTarget(elements, arg);
				if (!target) {
					return `NOT FOUND: "${arg}"`;
				}
				await robot.tap(target.cx, target.cy);
				return `tapped ${target.id}`;
			}
			case "type":
				await robot.sendKeys(arg);
				await new Promise(r => setTimeout(r, 200));
				await robot.dismissKeyboard();
				return `typed "${arg}"`;
			case "press":
				await robot.pressButton(arg as any);
				return `pressed ${arg}`;
			case "swipe":
				await robot.swipe(arg as any);
				return `swiped ${arg}`;
			case "dismiss": {
				// Dismiss bottom sheet by dragging handle downward
				const els = await robot.getElementsOnScreen();
				const handle = findElementByTarget(els, arg || "Bottom sheet handle");
				if (handle) {
					const screenSize = await robot.getScreenSize();
					await robot.swipeFromCoordinate(handle.cx, handle.cy, "down", Math.floor(screenSize.height * 0.4));
				} else {
					// Fallback: swipe down from center
					await robot.swipe("down");
				}
				return "dismissed";
			}
			case "screenshot": {
				// Save screenshot to specified path: "screenshot /path/to/file.png"
				if (!arg) {
					return "screenshot: no path specified";
				}
				const screenshotData = await robot.getScreenshot();
				fs.writeFileSync(arg, screenshotData);
				return `screenshot ${arg}`;
			}
			case "wait":
				await new Promise(r => setTimeout(r, parseInt(arg, 10) || 1000));
				return `waited ${arg}ms`;
			default:
				return `unknown: ${action}`;
		}
	};

	tool(
		"mobile_do",
		"Do",
		"All-in-one mobile tool. Performs action(s) then returns screen elements. Without actions, just reads screen. Each element has a stable ID like BUTTON:Confirm or INPUT:amount. Duplicates get @N suffix (BUTTON:Confirm@2). Actions: 'tap BUTTON:Confirm', 'type hello', 'press BACK', 'swipe up', 'dismiss', 'screenshot /path/to/file.png', 'wait 1000'. Use screenshot mid-batch to capture each screen during DFS exploration.",
		{
			device: z.string().describe("The device identifier to use."),
			actions: z.string().optional().describe('Action(s) before reading screen. Single string or JSON array. Examples: "tap BUTTON:Confirm", or ["tap TEXT:Send", "wait 1000", "screenshot /tmp/send.png", "press BACK"]'),
		},
		{ destructiveHint: true },
		async ({ device, actions }) => {
			const robot = getRobotFromDevice(device);
			const results: string[] = [];

			if (actions) {
				let actionList: string[];
				try {
					const parsed = JSON.parse(actions);
					actionList = Array.isArray(parsed) ? parsed : [actions];
				} catch {
					actionList = [actions];
				}

				for (let i = 0; i < actionList.length; i++) {
					const result = await executeAction(robot, actionList[i]);
					results.push(result);
					// Default 200ms delay between actions (unless current is wait)
					if (i < actionList.length - 1 && !actionList[i].toLowerCase().startsWith("wait")) {
						await new Promise(r => setTimeout(r, 200));
					}
				}
			}

			// Always return current screen state
			const elements = await robot.getElementsOnScreen();
			const screen = formatElements(elements);

			let output = "";
			if (results.length > 0) {
				output += results.join(" → ") + "\n\n";
			}
			output += screen;
			return output;
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
		{ destructiveHint: true },
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
		"mobile_save_screenshot",
		"Save Screenshot",
		"Save a screenshot of the mobile device to a file",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you."),
			saveTo: z.string().describe("The path to save the screenshot to. Filename must end with .png, .jpg, or .jpeg"),
		},
		{ destructiveHint: true },
		async ({ device, saveTo }) => {
			validateFileExtension(saveTo, ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot");
			validateOutputPath(saveTo);

			const robot = getRobotFromDevice(device);

			const screenshot = await robot.getScreenshot();
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
				device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
			},
			annotations: {
				readOnlyHint: true,
			},
		},
		async ({ device }) => {
			try {
				const robot = getRobotFromDevice(device);
				const screenSize = await robot.getScreenSize();

				let screenshot = await robot.getScreenshot();
				let mimeType = "image/png";

				// validate we received a png, will throw exception otherwise
				const image = new PNG(screenshot);
				const pngSize = image.getDimensions();
				if (pngSize.width <= 0 || pngSize.height <= 0) {
					throw new ActionableError("Screenshot is invalid. Please try again.");
				}

				if (isScalingAvailable()) {
					trace("Image scaling is available, resizing screenshot");
					const image = Image.fromBuffer(screenshot);
					const beforeSize = screenshot.length;
					screenshot = image.resize(Math.floor(pngSize.width / screenSize.scale))
						.jpeg({ quality: 75 })
						.toBuffer();

					const afterSize = screenshot.length;
					trace(`Screenshot resized from ${beforeSize} bytes to ${afterSize} bytes`);

					mimeType = "image/jpeg";
				}

				const screenshot64 = screenshot.toString("base64");
				trace(`Screenshot taken: ${screenshot.length} bytes`);
				posthog("tool_invoked", {
					"ToolName": "mobile_take_screenshot",
					"ScreenshotFilesize": screenshot64.length,
					"ScreenshotMimeType": mimeType,
					"ScreenshotWidth": pngSize.width,
					"ScreenshotHeight": pngSize.height,
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
		{ destructiveHint: true },
		async ({ device, orientation }) => {
			const robot = getRobotFromDevice(device);
			await robot.setOrientation(orientation);
			return `Changed device orientation to ${orientation}`;
		}
	);

	tool(
		"mobile_get_orientation",
		"Get Orientation",
		"Get the current screen orientation of the device",
		{
			device: z.string().describe("The device identifier to use. Use mobile_list_available_devices to find which devices are available to you.")
		},
		{ readOnlyHint: true },
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
		{ destructiveHint: true },
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
		{ destructiveHint: true },
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

	return server;
};

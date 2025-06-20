import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import * as fs from "fs";

import { error, trace } from "./logger";
import { AndroidRobot, AndroidDeviceManager } from "./android";
import { ActionableError, Robot } from "./robot";
import { SimctlManager } from "./iphone-simulator";
import { IosManager, IosRobot } from "./ios";
import { PNG } from "./png";
import { isImageMagickInstalled, Image } from "./image-utils";

export const getAgentVersion = (): string => {
	const json = require("../package.json");
	return json.version;
};

const getLatestAgentVersion = async (): Promise<string> => {
	const response = await fetch("https://api.github.com/repos/mobile-next/mobile-mcp/tags?per_page=1");
	const json = await response.json();
	return json[0].name;
};

const checkForLatestAgentVersion = async (): Promise<void> => {
	try {
		const latestVersion = await getLatestAgentVersion();
		const currentVersion = getAgentVersion();
		if (latestVersion !== currentVersion) {
			trace(`You are running an older version of the agent. Please update to the latest version: ${latestVersion}.`);
		}
	} catch (error: any) {
		// ignore
	}
};

export const createMcpServer = (): McpServer => {

	const server = new McpServer({
		name: "mobile-mcp",
		version: getAgentVersion(),
		capabilities: {
			resources: {},
			tools: {},
		},
	});

	// an empty object to satisfy windsurf
	const noParams = z.object({});

	const tool = (name: string, description: string, paramsSchema: ZodRawShape, cb: (args: z.objectOutputType<ZodRawShape, ZodTypeAny>) => Promise<string>) => {
		const wrappedCb = async (args: ZodRawShape): Promise<CallToolResult> => {
			try {
				trace(`Invoking ${name} with args: ${JSON.stringify(args)}`);
				const response = await cb(args);
				trace(`=> ${response}`);
				return {
					content: [{ type: "text", text: response }],
				};
			} catch (error: any) {
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
		};

		server.tool(name, description, paramsSchema, args => wrappedCb(args));
	};

	let robot: Robot | null;
	const simulatorManager = new SimctlManager();

	const requireRobot = () => {
		if (!robot) {
			throw new ActionableError("No device selected. Use the mobile_use_device tool to select a device.");
		}
	};

	tool(
		"mobile_use_default_device",
		"Use the default device. This is a shortcut for mobile_use_device with deviceType=simulator and device=simulator_name",
		{
			noParams
		},
		async () => {
			const iosManager = new IosManager();
			const androidManager = new AndroidDeviceManager();
			const simulators = simulatorManager.listBootedSimulators();
			const androidDevices = androidManager.getConnectedDevices();
			const iosDevices = iosManager.listDevices();

			const sum = simulators.length + androidDevices.length + iosDevices.length;
			if (sum === 0) {
				throw new ActionableError("No devices found. Please connect a device and try again.");
			} else if (sum >= 2) {
				throw new ActionableError("Multiple devices found. Please use the mobile_list_available_devices tool to list available devices and select one.");
			}

			// only one device connected, let's find it now
			if (simulators.length === 1) {
				robot = simulatorManager.getSimulator(simulators[0].name);
				return `Selected default device: ${simulators[0].name}`;
			} else if (androidDevices.length === 1) {
				robot = new AndroidRobot(androidDevices[0].deviceId);
				return `Selected default device: ${androidDevices[0].deviceId}`;
			} else if (iosDevices.length === 1) {
				robot = new IosRobot(iosDevices[0].deviceId);
				return `Selected default device: ${iosDevices[0].deviceId}`;
			}

			// how did this happen?
			throw new ActionableError("No device selected. Please use the mobile_list_available_devices tool to list available devices and select one.");
		}
	);

	tool(
		"mobile_list_available_devices",
		"List all available devices. This includes both physical devices and simulators. If there is more than one device returned, you need to let the user select one of them.",
		{
			noParams
		},
		async ({}) => {
			const iosManager = new IosManager();
			const androidManager = new AndroidDeviceManager();
			const simulators = simulatorManager.listBootedSimulators();
			const simulatorNames = simulators.map(d => d.name);
			const androidDevices = androidManager.getConnectedDevices();
			const iosDevices = await iosManager.listDevices();
			const iosDeviceNames = iosDevices.map(d => d.deviceId);
			const androidTvDevices = androidDevices.filter(d => d.deviceType === "tv").map(d => d.deviceId);
			const androidMobileDevices = androidDevices.filter(d => d.deviceType === "mobile").map(d => d.deviceId);

			const resp = ["Found these devices:"];
			if (simulatorNames.length > 0) {
				resp.push(`iOS simulators: [${simulatorNames.join(".")}]`);
			}

			if (iosDevices.length > 0) {
				resp.push(`iOS devices: [${iosDeviceNames.join(",")}]`);
			}

			if (androidMobileDevices.length > 0) {
				resp.push(`Android devices: [${androidMobileDevices.join(",")}]`);
			}

			if (androidTvDevices.length > 0) {
				resp.push(`Android TV devices: [${androidTvDevices.join(",")}]`);
			}

			return resp.join("\n");
		}
	);

	tool(
		"mobile_use_device",
		"Select a device to use. This can be a simulator or an Android device. Use the list_available_devices tool to get a list of available devices.",
		{
			device: z.string().describe("The name of the device to select"),
			deviceType: z.enum(["simulator", "ios", "android"]).describe("The type of device to select"),
		},
		async ({ device, deviceType }) => {
			switch (deviceType) {
				case "simulator":
					robot = simulatorManager.getSimulator(device);
					break;
				case "ios":
					robot = new IosRobot(device);
					break;
				case "android":
					robot = new AndroidRobot(device);
					break;
			}

			return `Selected device: ${device}`;
		}
	);

	tool(
		"mobile_list_apps",
		"List all the installed apps on the device",
		{
			noParams
		},
		async ({}) => {
			requireRobot();
			const result = await robot!.listApps();
			return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
		}
	);

	tool(
		"mobile_launch_app",
		"Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.",
		{
			packageName: z.string().describe("The package name of the app to launch"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.launchApp(packageName);
			return `Launched app ${packageName}`;
		}
	);

	tool(
		"mobile_terminate_app",
		"Stop and terminate an app on mobile device",
		{
			packageName: z.string().describe("The package name of the app to terminate"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"mobile_get_screen_size",
		"Get the screen size of the mobile device in pixels",
		{
			noParams
		},
		async ({}) => {
			requireRobot();
			const screenSize = await robot!.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	tool(
		"mobile_click_on_screen_at_coordinates",
		"Click on the screen at given x,y coordinates",
		{
			x: z.number().describe("The x coordinate to click on the screen, in pixels"),
			y: z.number().describe("The y coordinate to click on the screen, in pixels"),
		},
		async ({ x, y }) => {
			requireRobot();
			await robot!.tap(x, y);
			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_list_elements_on_screen",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
			noParams
		},
		async ({}) => {
			requireRobot();
			const elements = await robot!.getElementsOnScreen();

			const result = elements.map(element => {
				const out: any = {
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

				if (element.focused) {
					out.focused = true;
				}

				return out;
			});

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER, DPAD_CENTER (android tv only), DPAD_UP (android tv only), DPAD_DOWN (android tv only), DPAD_LEFT (android tv only), DPAD_RIGHT (android tv only)"),
		},
		async ({ button }) => {
			requireRobot();
			await robot!.pressButton(button);
			return `Pressed the button: ${button}`;
		}
	);

	tool(
		"mobile_open_url",
		"Open a URL in browser on device",
		{
			url: z.string().describe("The URL to open"),
		},
		async ({ url }) => {
			requireRobot();
			await robot!.openUrl(url);
			return `Opened URL: ${url}`;
		}
	);

	tool(
		"swipe_on_screen",
		"Swipe on the screen",
		{
			direction: z.enum(["up", "down", "left", "right"]).describe("The direction to swipe"),
			x: z.number().optional().describe("The x coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
			y: z.number().optional().describe("The y coordinate to start the swipe from, in pixels. If not provided, uses center of screen"),
			distance: z.number().optional().describe("The distance to swipe in pixels. Defaults to 400 pixels for iOS or 30% of screen dimension for Android"),
		},
		async ({ direction, x, y, distance }) => {
			requireRobot();

			if (x !== undefined && y !== undefined) {
				// Use coordinate-based swipe
				await robot!.swipeFromCoordinate(x, y, direction, distance);
				const distanceText = distance ? ` ${distance} pixels` : "";
				return `Swiped ${direction}${distanceText} from coordinates: ${x}, ${y}`;
			} else {
				// Use center-based swipe
				await robot!.swipe(direction);
				return `Swiped ${direction} on screen`;
			}
		}
	);

	tool(
		"mobile_type_keys",
		"Type text into the focused element",
		{
			text: z.string().describe("The text to type"),
			submit: z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
		},
		async ({ text, submit }) => {
			requireRobot();
			await robot!.sendKeys(text);

			if (submit) {
				await robot!.pressButton("ENTER");
			}

			return `Typed text: ${text}`;
		}
	);

	tool(
		"mobile_save_screenshot",
		"Save a screenshot of the mobile device to a file",
		{
			saveTo: z.string().describe("The path to save the screenshot to"),
		},
		async ({ saveTo }) => {
			requireRobot();

			const screenshot = await robot!.getScreenshot();
			fs.writeFileSync(saveTo, screenshot);
			return `Screenshot saved to: ${saveTo}`;
		}
	);

	server.tool(
		"mobile_take_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{
			noParams
		},
		async ({}) => {
			requireRobot();

			try {
				const screenSize = await robot!.getScreenSize();

				let screenshot = await robot!.getScreenshot();
				let mimeType = "image/png";

				// validate we received a png, will throw exception otherwise
				const image = new PNG(screenshot);
				const pngSize = image.getDimensions();
				if (pngSize.width <= 0 || pngSize.height <= 0) {
					throw new ActionableError("Screenshot is invalid. Please try again.");
				}

				if (isImageMagickInstalled()) {
					trace("ImageMagick is installed, resizing screenshot");
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
		"Change the screen orientation of the device",
		{
			orientation: z.enum(["portrait", "landscape"]).describe("The desired orientation"),
		},
		async ({ orientation }) => {
			requireRobot();
			await robot!.setOrientation(orientation);
			return `Changed device orientation to ${orientation}`;
		}
	);

	tool(
		"mobile_get_orientation",
		"Get the current screen orientation of the device",
		{
			noParams
		},
		async () => {
			requireRobot();
			const orientation = await robot!.getOrientation();
			return `Current device orientation is ${orientation}`;
		}
	);

	// async check for latest agent version
	checkForLatestAgentVersion().then();

	return server;
};

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import sharp from "sharp";

import { error, trace } from "./logger";
import { AndroidRobot, getConnectedDevices } from "./android";
import { ActionableError, Robot } from "./robot";
import { SimctlManager } from "./iphone-simulator";
import { IosManager, IosRobot } from "./ios";

const getAgentVersion = (): string => {
	const json = require("../package.json");
	return json.version;
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

	const requireTvRobot = () => {
		requireRobot();
		if (!(robot instanceof AndroidRobot && robot.deviceType === "tv")) {
			throw new ActionableError("This tool is only supported on Android TV devices. Let user know about this and stop executing further commands.");
		}
	};

	tool(
		"mobile_list_available_devices",
		"List all available devices. This includes both physical devices and simulators. If there is more than one device returned, you need to let the user select one of them.",
		{},
		async ({}) => {
			const iosManager = new IosManager();
			const devices = await simulatorManager.listBootedSimulators();
			const simulatorNames = devices.map(d => d.name);
			const androidDevices = getConnectedDevices();
			const iosDevices = await iosManager.listDevices();
			return `Found these iOS simulators: [${simulatorNames.join(".")}], iOS devices: [${iosDevices.join(",")}] and Android devices: [${androidDevices.join(",")}]`;
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

			const isAndroidTv = (robot instanceof AndroidRobot && robot.deviceType === "tv");

			return `Selected device: ${device} (${deviceType}).${isAndroidTv ? " This is an AndroidTV. Use tv specific tools for navigation and selecting" : ""}`;
		}
	);

	tool(
		"mobile_list_apps",
		"List all the installed apps on the device",
		{},
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
		{},
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
		},
		async ({}) => {
			requireRobot();
			const elements = await robot!.getElementsOnScreen();

			const result = elements.map(element => {
				const x = Number((element.rect.x + element.rect.width / 2)).toFixed(3);
				const y = Number((element.rect.y + element.rect.height / 2)).toFixed(3);

				return {
					text: element.label || element.name,
					coordinates: { x, y }
				};
			});

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER"),
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
			direction: z.enum(["up", "down"]).describe("The direction to swipe"),
		},
		async ({ direction }) => {
			requireRobot();
			await robot!.swipe(direction);
			return `Swiped ${direction} on screen`;
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

	server.tool(
		"mobile_take_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{},
		async ({}) => {
			requireRobot();

			try {
				const screenshot = await robot!.getScreenshot();

				// Scale down the screenshot by 50%
				const image = sharp(screenshot);
				const metadata = await image.metadata();
				if (!metadata.width) {
					throw new Error("Failed to get screenshot metadata");
				}

				const resizedScreenshot = await image
					.resize(Math.floor(metadata.width / 2))
					.jpeg({ quality: 75 })
					.toBuffer();

				// debug:
				// writeFileSync('/tmp/screenshot.png', screenshot);
				// writeFileSync('/tmp/screenshot-scaled.jpg', resizedScreenshot);

				const screenshot64 = resizedScreenshot.toString("base64");
				trace(`Screenshot taken: ${screenshot.length} bytes`);

				return {
					content: [{ type: "image", data: screenshot64, mimeType: "image/jpeg" }]
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
		{},
		async () => {
			requireRobot();
			const orientation = await robot!.getOrientation();
			return `Current device orientation is ${orientation}`;
		}
	);

	tool(
		"tv_dpad_navigate_to_item_with_label",
		"Navigate to an item on screen with a specific label using D-pad. This is specifically for TV devices which depend on D-pad based traversal.",
		{
			label: z.string().describe("The label of the item to navigate to"),
		},
		async ({ label }) => {
			requireTvRobot();
			(robot as AndroidRobot).navigateToItemWithLabel(label);

			return `Navigated with D-pad to item with label: ${label}`;
		}
	);

	tool(
		"tv_dpad_press_button",
		"Press a button on the D-pad. This is specifically for TV Devices which depend on D-pad.",
		{
			button: z.string().describe("The D-pad button to press. Supported buttons: DPAD_CENTER (center), DPAD_UP(up), DPAD_DOWN(down), DPAD_LEFT(left), DPAD_RIGHT(right)"),
		},
		async ({ button }) => {
			requireTvRobot();
			(robot as AndroidRobot).pressDpad(button);

			return `Pressed D-pad button: ${button}`;
		}
	);

	return server;
};

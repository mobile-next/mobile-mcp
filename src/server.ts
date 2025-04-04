import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import sharp from "sharp";

import { error, trace } from "./logger";
import { AndroidRobot } from "./android";
import { Robot } from "./robot";

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
				trace(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }],
					isError: true,
				};
			}
		};

		server.tool(name, description, paramsSchema, args => wrappedCb(args));
	};

	const robot: Robot = new AndroidRobot();

	tool(
		"mobile_list_apps",
		"List all the installed apps on the device",
		{},
		async ({}) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			const result = await robot.listApps();
			return `Found these packages on device: ${result.join(",")}`;
		}
	);

	tool(
		"mobile_launch_app",
		"Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.",
		{
			packageName: z.string().describe("The package name of the app to launch"),
		},
		async ({ packageName }) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			await robot.launchApp(packageName);
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
			if (!robot) {
				throw new Error("No device selected");
			}

			await robot.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"mobile_get_screen_size",
		"Get the screen size of the mobile device in pixels",
		{},
		async ({}) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			const screenSize = await robot.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	tool(
		"mobile_click_on_screen_at_coordinates",
		"Click on the screen at given x,y coordinates",
		{
			x: z.number().describe("The x coordinate to click between 0 and 1"),
			y: z.number().describe("The y coordinate to click between 0 and 1"),
		},
		async ({ x, y }) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			const screenSize = await robot.getScreenSize();
			const x0 = Math.floor(screenSize.width * x);
			const y0 = Math.floor(screenSize.height * y);
			await robot.tap(x0, y0);
			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_list_elements_on_screen",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
		},
		async ({}) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			const screenSize = await robot.getScreenSize();
			const elements = await robot.getElementsOnScreen();

			const result = [];
			for (let i = 0; i < elements.length; i++) {
				elements[i].rect.x0 = elements[i].rect.x0 / screenSize.width;
				elements[i].rect.y0 = elements[i].rect.y0 / screenSize.height;
				elements[i].rect.x1 = elements[i].rect.x1 / screenSize.width;
				elements[i].rect.y1 = elements[i].rect.y1 / screenSize.height;
				result.push({
					text: elements[i].label,
					coordinates: {
						x: (elements[i].rect.x0 + elements[i].rect.x1) / 2,
						y: (elements[i].rect.y0 + elements[i].rect.y1) / 2,
					}
				});
			}

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: BACK, HOME, VOLUME_UP, VOLUME_DOWN, ENTER"),
		},
		async ({ button }) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			robot.pressButton(button);
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
			if (!robot) {
				throw new Error("No device selected");
			}

			robot.openUrl(url);
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
			if (!robot) {
				throw new Error("No device selected");
			}

			robot.swipe(direction);
			return `Swiped ${direction} on screen`;
		}
	);

	tool(
		"mobile_type_keys",
		"Type text into the focused element",
		{
			text: z.string().describe("The text to type"),
		},
		async ({ text }) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			robot.sendKeys(text);
			return `Typed text: ${text}`;
		}
	);

	server.tool(
		"mobile_take_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{},
		async ({}) => {
			if (!robot) {
				throw new Error("No device selected");
			}

			try {
				const screenshot = await robot.getScreenshot();

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

	return server;
};

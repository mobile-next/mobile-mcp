import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { execSync } from "child_process";
import { error, trace } from "./logger";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import { AndroidRobot, getElementsOnScreen, getScreenSize, listApps, swipe, takeScreenshot } from "./android";

import sharp from "sharp";
import { filterSourceElements, getPageSource, getScreenshot, iosGetScreenSize, iosOpenUrl, iosSwipe, launchApp, pressHomeButton, sendKeys, tap } from "./iphone-simulator";

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

	const robot = new AndroidRobot();

	tool(
		"list_apps_on_device",
		"List all apps on device",
		{},
		async ({}) => {
			const result = listApps();
			return `Found these packages on device: ${result.join(",")}`;
		}
	);

	tool(
		"launch_app",
		"Launch an app on mobile device",
		{
			packageName: z.string().describe("The package name of the app to launch"),
		},
		async ({ packageName }) => {
			// execSync(`adb shell monkey -p "${packageName}" -c android.intent.category.LAUNCHER 1`);

			launchApp("iPhone 16", packageName);

			return `Launched app ${packageName}`;
		}
	);

	tool(
		"terminate_app",
		"Stop and terminate an app on mobile device",
		{
			packageName: z.string().describe("The package name of the app to terminate"),
		},
		async ({ packageName }) => {
			robot.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"get_screen_size",
		"Get the screen size of the mobile device in pixels",
		{},
		async ({}) => {
			// const screenSize = getScreenSize();
			const screenSize = await iosGetScreenSize(8100);
			return `Screen size is ${screenSize[0]}x${screenSize[1]} pixels`;
		}
	);

	tool(
		"click_on_screen_at_coordinates",
		"Click on the screen at given x,y coordinates",
		{
			x: z.number().describe("The x coordinate to click between 0 and 1"),
			y: z.number().describe("The y coordinate to click between 0 and 1"),
		},
		async ({ x, y }) => {
			const screenSize = await iosGetScreenSize(8100);
			// const screenSize = getScreenSize();
			const x0 = Math.floor(screenSize[0] * x);
			const y0 = Math.floor(screenSize[1] * y);
			// execSync(`adb shell input tap ${x0} ${y0}`);
			tap(8100, x0, y0);

			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"list_elements_on_screen",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
		},
		async ({}) => {
			// const elements = getElementsOnScreen();
			const screenSize = await iosGetScreenSize(8100);
			const pageSource = await getPageSource(8100);
			const elements = filterSourceElements(pageSource.value);

			for (let i = 0; i < elements.length; i++) {
				elements[i].rect.x0 = Math.floor(elements[i].rect.x0 / screenSize[0]);
				elements[i].rect.y0 = Math.floor(elements[i].rect.y0 / screenSize[1]);
				elements[i].rect.x1 = Math.floor(elements[i].rect.x1 / screenSize[0]);
				elements[i].rect.y1 = Math.floor(elements[i].rect.y1 / screenSize[1]);
			}

			return `Found these elements on screen: ${JSON.stringify(elements)}`;
		}
	);

	tool(
		"press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: KEYCODE_BACK, KEYCODE_HOME, KEYCODE_MENU, KEYCODE_VOLUME_UP, KEYCODE_VOLUME_DOWN, KEYCODE_ENTER"),
		},
		async ({ button }) => {
			// execSync(`adb shell input keyevent ${button}`);
			pressHomeButton(8100);
			return `Pressed the button: ${button}`;
		}
	);

	tool(
		"open_url",
		"Open a URL in browser on device",
		{
			url: z.string().describe("The URL to open"),
		},
		async ({ url }) => {
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
			// swipe(direction);
			robot.swipe(direction);
			return `Swiped ${direction} on screen`;
		}
	);

	tool(
		"type_text",
		"Type text into the focused element",
		{
			text: z.string().describe("The text to type"),
		},
		async ({ text }) => {
			robot.sendKeys(text);
			return `Typed text: ${text}`;
		}
	);

	server.tool(
		"take_device_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{},
		async ({}) => {
			try {
				// const screenshot = await takeScreenshot();
				const screenshot = getScreenshot("iPhone 16");

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


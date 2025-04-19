import path from "path";
import { execFileSync } from "child_process";

import * as xml from "fast-xml-parser";

import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenElementRect, ScreenSize, SwipeDirection, Orientation } from "./robot";

interface UiAutomatorXmlNode {
	node: UiAutomatorXmlNode[];
	class?: string;
	text?: string;
	bounds?: string;
	hint?: string;
	focused?: string;
	"content-desc"?: string;
}

interface UiAutomatorXml {
	hierarchy: {
		node: UiAutomatorXmlNode;
	};
}

const getAdbPath = (): string => {
	let executable = "adb";
	if (process.env.ANDROID_HOME) {
		executable = path.join(process.env.ANDROID_HOME, "platform-tools", "adb");
	}

	return executable;
};

const BUTTON_MAP: Record<Button, string> = {
	"BACK": "KEYCODE_BACK",
	"HOME": "KEYCODE_HOME",
	"VOLUME_UP": "KEYCODE_VOLUME_UP",
	"VOLUME_DOWN": "KEYCODE_VOLUME_DOWN",
	"ENTER": "KEYCODE_ENTER",
};

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

type AndroidDeviceType = "tv" | "standard";

type DpadButton = "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT" | "DPAD_CENTER";

export class AndroidRobot implements Robot {

	private deviceType: AndroidDeviceType = "standard"; // Default to standard

	public constructor(private deviceId: string) {
		// --- Device Type Detection ---
		try {
			const features = this.adb("shell", "pm", "list", "features").toString();
			if (features.includes("android.software.leanback") || features.includes("android.hardware.type.television")) {
				this.deviceType = "tv";
			}
		} catch (error: any) {
			// Defaulting to 'standard' is already set
		}
	}

	public adb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const screenSize = this.adb("shell", "wm", "size")
			.toString()
			.split(" ")
			.pop();

		if (!screenSize) {
			throw new Error("Failed to get screen size");
		}

		const scale = 1;
		const [width, height] = screenSize.split("x").map(Number);
		return { width, height, scale };
	}

	public async listApps(): Promise<InstalledApp[]> {
		return this.adb("shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("packageName="))
			.map(line => line.substring("packageName=".length))
			.filter((value, index, self) => self.indexOf(value) === index)
			.map(packageName => ({
				packageName,
				appName: packageName,
			}));
	}

	public async launchApp(packageName: string): Promise<void> {
		this.adb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		// const centerY = screenSize[1] >> 1;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.80);
				y1 = Math.floor(screenSize.height * 0.20);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.20);
				y1 = Math.floor(screenSize.height * 0.80);
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.adb("shell", "screencap", "-p");
	}

	private collectElements(node: UiAutomatorXmlNode): ScreenElement[] {
		const elements: Array<ScreenElement> = [];

		if (node.node) {
			if (Array.isArray(node.node)) {
				for (const childNode of node.node) {
					elements.push(...this.collectElements(childNode));
				}
			} else {
				elements.push(...this.collectElements(node.node));
			}
		}

		if (node.text || node["content-desc"] || node.hint) {
			const element: ScreenElement = {
				type: node.class || "text",
				name: node.text,
				label: node["content-desc"] || node.hint || "",
				rect: this.getScreenElementRect(node),
			};

			if (element.rect.width > 0 && element.rect.height > 0) {
				elements.push(element);
			}
		}

		return elements;
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const parsedXml = this.getParsedXml();
		const hierarchy = parsedXml.hierarchy;

		const elements = this.collectElements(hierarchy.node);
		return elements;
	}

	public async terminateApp(packageName: string): Promise<void> {
		this.adb("shell", "am", "force-stop", packageName);
	}

	public async openUrl(url: string): Promise<void> {
		this.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url);
	}

	public async sendKeys(text: string): Promise<void> {
		// adb shell requires some escaping
		const _text = text.replace(/ /g, "\\ ");
		this.adb("shell", "input", "text", _text);
	}

	public async pressButton(button: Button) {
		if (!BUTTON_MAP[button]) {
			throw new ActionableError(`Button "${button}" is not supported`);
		}

		this.adb("shell", "input", "keyevent", BUTTON_MAP[button]);
	}

	public async tap(x: number, y: number): Promise<void> {
		if (this.deviceType === "tv") {
			await this.tvTap(x, y);
			return;
		}
		this.adb("shell", "input", "tap", `${x}`, `${y}`);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		// Android uses numbers for orientation:
		// 0 - Portrait
		// 1 - Landscape
		const orientationValue = orientation === "portrait" ? 0 : 1;

		// Set orientation using content provider
		this.adb(
			"shell",
			"content",
			"insert",
			"--uri",
			"content://settings/system",
			"--bind",
			"name:s:user_rotation",
			"--bind",
			`value:i:${orientationValue}`
		);

		// Force the orientation change
		this.adb(
			"shell",
			"settings",
			"put",
			"system",
			"accelerometer_rotation",
			"0"
		);
	}

	public async getOrientation(): Promise<Orientation> {
		const rotation = this.adb(
			"shell",
			"settings",
			"get",
			"system",
			"user_rotation"
		).toString().trim();

		return rotation === "0" ? "portrait" : "landscape";
	}

	private getParsedXml(): UiAutomatorXml {
		const dump = this.adb("exec-out", "uiautomator", "dump", "/dev/tty");

		const parser = new xml.XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: ""
		});

		return parser.parse(dump) as UiAutomatorXml;
	}

	private getScreenElementRect(node: UiAutomatorXmlNode): ScreenElementRect {
		const bounds = String(node.bounds);

		const [, left, top, right, bottom] = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.map(Number) || [];
		return {
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	// --- TV Specific Methods ---

	private async tvTap(x: number, y: number): Promise<void> {
		let currentDirection = this.getDpadDirection(x, y);

		while (currentDirection) {
			this.pressDpad(currentDirection);
			currentDirection = this.getDpadDirection(x, y);
		}

		// Upon breaking from the while loop, we have reached at the target coordinates
		// Press the dpad center button to 'click' on the focused element
		this.pressDpad("DPAD_CENTER");
	}

	/**
	 * Find the focused element in the UI hierarchy.
	 *
	 * @param node - The root node of the UI hierarchy.
	 * @returns The focused element node or null if not found.
	 */
	private findFocusedElement(node: UiAutomatorXmlNode): UiAutomatorXmlNode | null {
		if (node["focused"] === "true") {
			return node;
		}

		if (node.node) {
			if (Array.isArray(node.node)) {
				for (const childNode of node.node) {
					const focusedChild = this.findFocusedElement(childNode);
					if (focusedChild) {
						return focusedChild;
					}
				}
			} else {
				const focusedChild = this.findFocusedElement(node.node);
				if (focusedChild) {
					return focusedChild;
				}
			}
		}

		return null;
	}

	/**
	 * Get the dpad direction based on the target coordinates.
	 *
	 * @param targetX - The target X coordinate.
	 * @param targetY - The target Y coordinate.
	 * @returns The dpad direction or null if no dpad direction is needed.
	 */
	private getDpadDirection(targetX: number, targetY: number): DpadButton | null {
		// Always use the latest parsed XML. When dpad keyevent is sent, the screen is updated and
		// the focused element may have changed.
		const parsedXml = this.getParsedXml();
		const focusedElement = this.findFocusedElement(parsedXml.hierarchy.node);

		// No focused element
		if (!focusedElement) {
			return null;
		}

		const focusedRect = this.getScreenElementRect(focusedElement);

		// Check if the target coordinates are within the bounds of the focused element
		const isWithinBounds = targetX >= focusedRect.x && targetX <= focusedRect.x + focusedRect.width &&
			targetY >= focusedRect.y && targetY <= focusedRect.y + focusedRect.height;

		// If within bounds then no dpad direction is needed
		if (isWithinBounds) {
			return null;
		}

		if (targetX < focusedRect.x) {
			return "DPAD_LEFT";
		} else if (targetX > focusedRect.x + focusedRect.width) {
			return "DPAD_RIGHT";
		} else if (targetY < focusedRect.y) {
			return "DPAD_UP";
		} else if (targetY > focusedRect.y + focusedRect.height) {
			return "DPAD_DOWN";
		}

		// No further valid cases to be covered
		return null;
	}

	private async pressDpad(dpadButton: DpadButton): Promise<void> {
		this.adb("shell", "input", "keyevent", dpadButton);
	}
}

export const getConnectedDevices = (): string[] => {
	try {
		return execFileSync(getAdbPath(), ["devices"])
			.toString()
			.split("\n")
			.filter(line => !line.startsWith("List of devices attached"))
			.filter(line => line.trim() !== "")
			.map(line => line.split("\t")[0]);
	} catch (error) {
		console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
		return [];
	}
};

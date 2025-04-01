import { execFileSync, execSync } from "child_process";
import * as xml from "fast-xml-parser";
import { Bounds, Button, Dimensions, ElementCoordinates, Robot, SwipeDirection } from "./robot";
import path from "path";

interface UiAutomatorXmlNode {
	node: UiAutomatorXmlNode[];
	text?: string;
	bounds?: string;
	"content-desc"?: string;
}

interface UiAutomatorXml {
	hierarchy: {
		node: UiAutomatorXmlNode;
	};
}

export class AndroidRobot implements Robot {

	public async getScreenSize(): Promise<Dimensions> {
		const screenSize = execSync("adb shell wm size")
			.toString()
			.split(" ")
			.pop();

		if (!screenSize) {
			throw new Error("Failed to get screen size");
		}

		const [width, height] = screenSize.split("x").map(Number);
		return { width, height };
	}

	public adb(args: string[]): Buffer {

		let executable = "adb";
		if (process.env.ANDROID_HOME) {
			executable = path.join(process.env.ANDROID_HOME, "platform-tools", "adb");
		}

		return execFileSync(executable, args, { maxBuffer: 1024 * 1024 * 4 });
	}

	public async listApps(): Promise<string[]> {
		const result = this.adb(["shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER"])
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("packageName="))
			.map(line => line.substring("packageName=".length))
			.filter((value, index, self) => self.indexOf(value) === index);

		return result;
	}

	public async launchApp(packageName: string): Promise<void> {
		this.adb(["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"]);
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		// const centerY = screenSize[1] >> 1;

		let x0, y0, x1, y1: number;

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
				throw new Error(`Swipe direction "${direction}" is not supported`);
		}

		this.adb(["shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000"]);
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.adb(["shell", "screencap", "-p"]);
	}

	private collectElements(node: UiAutomatorXmlNode, screenSize: Dimensions): any[] {
		const elements: any[] = [];

		const getCoordinates = (element: UiAutomatorXmlNode): Bounds => {
			const bounds = String(element.bounds);

			const [, left, top, right, bottom] = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.map(Number) || [];
			return { left, top, right, bottom };
		};

		const getCenter = (coordinates: Bounds): ElementCoordinates => {
			return {
				x: Math.floor((coordinates.left + coordinates.right) / 2),
				y: Math.floor((coordinates.top + coordinates.bottom) / 2),
			};
		};

		const normalizeCoordinates = (coordinates: ElementCoordinates, screenSize: Dimensions): ElementCoordinates => {
			return {
				x: Number((coordinates.x / screenSize.width).toFixed(3)),
				y: Number((coordinates.y / screenSize.height).toFixed(3)),
			};
		};

		if (node.node) {
			if (Array.isArray(node.node)) {
				for (const childNode of node.node) {
					elements.push(...this.collectElements(childNode, screenSize));
				}
			} else {
				elements.push(...this.collectElements(node.node, screenSize));
			}
		}

		if (node.text) {
			elements.push({
				"text": node.text,
				"coordinates": normalizeCoordinates(getCenter(getCoordinates(node)), screenSize),
			});
		}

		if (node["content-desc"]) {
			elements.push({
				"text": node["content-desc"],
				"coordinates": normalizeCoordinates(getCenter(getCoordinates(node)), screenSize),
			});
		}

		return elements;
	}

	public async getElementsOnScreen(): Promise<any[]> {
		const dump = this.adb(["exec-out", "uiautomator", "dump", "/dev/tty"]);

		const parser = new xml.XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: ""
		});

		const parsedXml = parser.parse(dump) as UiAutomatorXml;
		const hierarchy = parsedXml.hierarchy;

		const screenSize = await this.getScreenSize();
		const elements = this.collectElements(hierarchy.node, screenSize);
		return elements;
	};

	public async terminateApp(packageName: string): Promise<void> {
		this.adb(["shell", "am", "force-stop", packageName]);
	}

	public async openUrl(url: string): Promise<void> {
		this.adb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url]);
	}

	public async sendKeys(text: string): Promise<void> {
		// adb shell requires some escaping
		const _text = text.replace(/ /g, "\\ ");
		this.adb(["shell", "input", "text", _text]);
	}

	public async pressButton(button: Button) {
		const _map = {
			"BACK": "KEYCODE_BACK",
			"HOME": "KEYCODE_HOME",
			"VOLUME_UP": "KEYCODE_VOLUME_UP",
			"VOLUME_DOWN": "KEYCODE_VOLUME_DOWN",
			"ENTER": "KEYCODE_ENTER",
		};

		if (!_map[button]) {
			throw new Error(`Button "${button}" is not supported`);
		}

		this.adb(["shell", "input", "keyevent", _map[button]]);
	}

	public async tap(x: number, y: number): Promise<void> {
		this.adb(["shell", "input", "tap", `${x}`, `${y}`]);
	}
}

export const getConnectedDevices = (): string[] => {
	return execSync(`adb devices`)
		.toString()
		.split("\n")
		.filter(line => !line.startsWith("List of devices attached"))
		.filter(line => line.trim() !== "");
};

export const resolveLaunchableActivities = (packageName: string): string[] => {
	return execSync(`adb shell cmd package resolve-activity ${packageName}`)
		.toString()
		.split("\n")
		.map(line => line.trim())
		.filter(line => line.startsWith("name="))
		.map(line => line.substring("name=".length));
};

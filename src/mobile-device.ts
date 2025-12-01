import { execFileSync } from "node:child_process";

import { getMobilecliPath } from "./mobilecli";
import { ActionableError, Button, InstalledApp, Orientation, Robot, ScreenElement, ScreenSize, SwipeDirection } from "./robot";

const TIMEOUT = 120000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;
const SWIPE_START_POSITION = 0.80;
const SWIPE_END_POSITION = 0.20;
const DEFAULT_SWIPE_DISTANCE_PERCENT = 0.30;
const DOUBLE_TAP_DELAY_MS = 100;

interface MobilecliResponse<T> {
	status: string;
	data: T;
}

interface DeviceInfo {
	device: {
		id: string;
		name: string;
		platform: string;
		type: string;
		version: string;
		state: string;
		screenSize: {
			width: number;
			height: number;
			scale: number;
		};
	};
}

interface AppInfo {
	packageName: string;
	appName?: string;
	version?: string;
}

interface DumpUiElement {
	type: string;
	label?: string;
	text?: string;
	name?: string;
	value?: string;
	identifier?: string;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	focused?: boolean;
}

interface DumpUiData {
	elements: DumpUiElement[];
}

export class MobileDeviceRobot implements Robot {

	constructor(private readonly deviceId: string) {}

	private mobilecli(...args: string[]): Buffer {
		return execFileSync(getMobilecliPath(), ["--device", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	private mobilecliJson<T>(...args: string[]): T {
		const output = this.mobilecli(...args).toString();
		const response: MobilecliResponse<T> & { error?: string } = JSON.parse(output);

		if (response.status === "error") {
			throw new ActionableError(response.error || "Unknown error from mobilecli");
		}

		return response.data;
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const info = this.mobilecliJson<DeviceInfo>("device", "info");

		return {
			width: info.device.screenSize.width,
			height: info.device.screenSize.height,
			scale: info.device.screenSize.scale,
		};
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		const centerY = screenSize.height >> 1;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * SWIPE_START_POSITION);
				y1 = Math.floor(screenSize.height * SWIPE_END_POSITION);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * SWIPE_END_POSITION);
				y1 = Math.floor(screenSize.height * SWIPE_START_POSITION);
				break;
			case "left":
				x0 = Math.floor(screenSize.width * SWIPE_START_POSITION);
				x1 = Math.floor(screenSize.width * SWIPE_END_POSITION);
				y0 = y1 = centerY;
				break;
			case "right":
				x0 = Math.floor(screenSize.width * SWIPE_END_POSITION);
				x1 = Math.floor(screenSize.width * SWIPE_START_POSITION);
				y0 = y1 = centerY;
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		this.mobilecli("io", "swipe", `${x0},${y0},${x1},${y1}`);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const screenSize = await this.getScreenSize();

		let x0: number, y0: number, x1: number, y1: number;

		const defaultDistanceY = Math.floor(screenSize.height * DEFAULT_SWIPE_DISTANCE_PERCENT);
		const defaultDistanceX = Math.floor(screenSize.width * DEFAULT_SWIPE_DISTANCE_PERCENT);
		const swipeDistanceY = distance || defaultDistanceY;
		const swipeDistanceX = distance || defaultDistanceX;

		switch (direction) {
			case "up":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.max(0, y - swipeDistanceY);
				break;
			case "down":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.min(screenSize.height, y + swipeDistanceY);
				break;
			case "left":
				x0 = x;
				x1 = Math.max(0, x - swipeDistanceX);
				y0 = y1 = y;
				break;
			case "right":
				x0 = x;
				x1 = Math.min(screenSize.width, x + swipeDistanceX);
				y0 = y1 = y;
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		this.mobilecli("io", "swipe", `${x0},${y0},${x1},${y1}`);
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.mobilecli("screenshot", "-o", "-");
	}

	public async listApps(): Promise<InstalledApp[]> {
		const apps = this.mobilecliJson<AppInfo[]>("apps", "list");

		return apps.map(app => ({
			packageName: app.packageName,
			appName: app.appName || app.packageName,
		}));
	}

	public async launchApp(packageName: string): Promise<void> {
		try {
			this.mobilecli("apps", "launch", packageName);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async terminateApp(packageName: string): Promise<void> {
		try {
			this.mobilecli("apps", "terminate", packageName);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async installApp(path: string): Promise<void> {
		try {
			this.mobilecli("apps", "install", path);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			this.mobilecli("apps", "uninstall", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async openUrl(url: string): Promise<void> {
		this.mobilecli("url", url);
	}

	public async sendKeys(text: string): Promise<void> {
		if (text === "") {
			return;
		}

		this.mobilecli("io", "text", text);
	}

	public async pressButton(button: Button): Promise<void> {
		this.mobilecli("io", "button", button);
	}

	public async tap(x: number, y: number): Promise<void> {
		this.mobilecli("io", "tap", `${x},${y}`);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		await this.tap(x, y);
		await new Promise(r => setTimeout(r, DOUBLE_TAP_DELAY_MS));
		await this.tap(x, y);
	}

	public async longPress(x: number, y: number): Promise<void> {
		this.mobilecli("io", "longpress", `${x},${y}`);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const result = this.mobilecliJson<DumpUiData>("dump", "ui");

		return result.elements.map(elem => {
			const screenElement: ScreenElement = {
				type: elem.type,
				label: elem.label,
				text: elem.text,
				name: elem.name,
				value: elem.value,
				identifier: elem.identifier,
				rect: elem.rect,
			};

			if (elem.focused) {
				screenElement.focused = true;
			}

			return screenElement;
		});
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		this.mobilecli("device", "orientation", "set", orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		const result = this.mobilecliJson<{ orientation: string }>("device", "orientation", "get");
		const orientation = result.orientation;

		if (orientation === "portrait" || orientation === "landscape") {
			return orientation;
		}

		throw new ActionableError(`Unknown orientation: ${orientation}`);
	}
}

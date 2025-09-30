import { execFileSync } from "node:child_process";

import { InstalledApp, ScreenSize, Button, Orientation, ScreenElement } from "./robot";

interface MobilecliResponse<T> {
	status: string;
	data: T;
}

interface MobilecliApp {
	packageName: string;
	appName: string;
	version: string;
}

export interface MobilecliDevice {
	id: string;
	name: string;
	platform: string;
	type: string;
}

interface MobilecliDevicesResponse {
	devices: MobilecliDevice[];
}

interface MobilecliDeviceInfo {
	device: {
		id: string;
		name: string;
		platform: string;
		type: string;
		version: string;
		screenSize: ScreenSize;
	};
}

export const getMobilecliPath = (): string => {
	if (process.env.MOBILECLI_PATH) {
		return process.env.MOBILECLI_PATH;
	}

	const platform = process.platform;
	const basePath = "./node_modules/@mobilenext/mobilecli/bin/mobilecli";

	if (platform === "darwin") {
		return `${basePath}-darwin`;
	}

	if (platform === "linux") {
		const arch = process.arch;
		if (arch === "arm64") {
			return `${basePath}-linux-arm64`;
		}

		return `${basePath}-linux-amd64`;
	}

	if (platform === "win32") {
		return `${basePath}-windows-amd64.exe`;
	}

	throw new Error(`Unsupported platform: ${platform}`);
};

export class Mobilecli {

	private static mobilecli(...args: string[]): string {
		return execFileSync(getMobilecliPath(), args).toString();
	}

	public static isInstalled(): boolean {
		try {
			const output = execFileSync(getMobilecliPath(), ["--version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
			return output.includes("mobilecli");
		} catch (error) {
			return false;
		}
	}

	public static listDevices(): MobilecliDevice[] {
		if (!this.isInstalled()) {
			console.error("mobilecli is not installed, no devices can be detected");
			return [];
		}

		try {
			const output = this.mobilecli("devices");
			const response: MobilecliResponse<MobilecliDevicesResponse> = JSON.parse(output);
			if (response.status !== "ok") {
				throw new Error(`Failed to list devices: ${response.status}`);
			}

			return response.data.devices;
		} catch (error) {
			console.error("Error listing devices", error);
			return [];
		}
	}

	public static getScreenshot(deviceId: string): Buffer {
		const output = execFileSync(getMobilecliPath(), ["screenshot", "--device", deviceId, "-o", "-"], {
			encoding: null,
			maxBuffer: 32 * 1024 * 1024 // 32MB
		});

		return output as unknown as Buffer;
	}

	public static async listApps(deviceId: string): Promise<InstalledApp[]> {
		const output = this.mobilecli("--device", deviceId, "apps", "list");
		const response: MobilecliResponse<MobilecliApp[]> = JSON.parse(output);

		if (response.status !== "ok") {
			throw new Error(`Failed to list apps: ${response.status}`);
		}

		return response.data.map(app => ({
			packageName: app.packageName,
			appName: app.appName,
		}));
	}

	public static launchApp(deviceId: string, packageName: string): void {
		this.mobilecli("--device", deviceId, "apps", "launch", packageName);
	}

	public static terminateApp(deviceId: string, packageName: string): void {
		this.mobilecli("--device", deviceId, "apps", "terminate", packageName);
	}

	public static getScreenSize(deviceId: string): ScreenSize {
		const output = this.mobilecli("device", "info", "--device", deviceId);
		const response: MobilecliResponse<MobilecliDeviceInfo> = JSON.parse(output);

		if (response.status !== "ok") {
			throw new Error(`Failed to get device info: ${response.status}`);
		}

		return response.data.device.screenSize;
	}

	public static pressButton(deviceId: string, button: Button): void {
		this.mobilecli("io", "button", button, "--device", deviceId);
	}

	public static tap(deviceId: string, x: number, y: number): void {
		this.mobilecli("io", "tap", `${x},${y}`, "--device", deviceId);
	}

	public static longPress(deviceId: string, x: number, y: number): void {
		this.mobilecli("io", "longpress", `${x},${y}`, "--device", deviceId);
	}

	public static sendKeys(deviceId: string, text: string): void {
		this.mobilecli("io", "text", text, "--device", deviceId);
	}

	public static swipe(deviceId: string, x1: number, y1: number, x2: number, y2: number): void {
		this.mobilecli("io", "swipe", `${x1},${y1},${x2},${y2}`, "--device", deviceId);
	}

	public static openUrl(deviceId: string, url: string): void {
		this.mobilecli("url", url, "--device", deviceId);
	}

	public static getDeviceInfo(deviceId: string): string {
		return this.mobilecli("--device", deviceId, "device", "info");
	}

	public static getDeviceInfoByDeviceId(deviceId: string): string {
		return this.mobilecli("device", "info", "--device", deviceId);
	}

	public static getOrientation(deviceId: string): Orientation {
		const output = this.mobilecli("device", "orientation", "get", "--device", deviceId);
		const response: MobilecliResponse<{ orientation: string }> = JSON.parse(output);
		if (response.status !== "ok") {
			throw new Error(`Failed to get orientation: ${response.status}`);
		}

		return response.data.orientation as Orientation;
	}

	public static setOrientation(deviceId: string, orientation: Orientation): void {
		this.mobilecli("device", "orientation", "set", orientation, "--device", deviceId);
	}

	public static getElementsOnScreen(deviceId: string): ScreenElement[] {
		const output = this.mobilecli("dump", "ui", "--device", deviceId);
		const response: MobilecliResponse<{ elements: any[] }> = JSON.parse(output);
		if (response.status !== "ok") {
			throw new Error(`Failed to get elements on screen: ${response.status}`);
		}

		return response.data.elements.map(element => ({
			type: element.type,
			label: element.label,
			text: element.label || element.name || element.value || "",
			name: element.name,
			value: element.value,
			rect: {
				x: element.rect.x,
				y: element.rect.y,
				width: element.rect.width,
				height: element.rect.height,
			},
		}));
	}
}

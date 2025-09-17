import { execFileSync } from "node:child_process";

import { InstalledApp, ScreenSize, Button } from "./robot";

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
		screenSize: {
			width: number;
			height: number;
			scale: number;
		};
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
			const output = execFileSync(getMobilecliPath(), ["devices"]).toString();
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
		const output = execFileSync(getMobilecliPath(), ["--device", deviceId, "apps", "list"], {}).toString();
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
		execFileSync(getMobilecliPath(), ["--device", deviceId, "apps", "launch", packageName], {});
	}

	public static terminateApp(deviceId: string, packageName: string): void {
		execFileSync(getMobilecliPath(), ["--device", deviceId, "apps", "terminate", packageName], {});
	}

	public static getScreenSize(deviceId: string): ScreenSize {
		const output = execFileSync(getMobilecliPath(), ["device", "info", "--device", deviceId], {}).toString();
		const response: MobilecliResponse<MobilecliDeviceInfo> = JSON.parse(output);

		if (response.status !== "ok") {
			throw new Error(`Failed to get device info: ${response.status}`);
		}

		return {
			width: response.data.device.screenSize.width,
			height: response.data.device.screenSize.height,
			scale: response.data.device.screenSize.scale,
		};
	}

	public static pressButton(deviceId: string, button: Button): void {
		execFileSync(getMobilecliPath(), ["io", "button", button, "--device", deviceId], {});
	}

	public static tap(deviceId: string, x: number, y: number): void {
		execFileSync(getMobilecliPath(), ["io", "tap", `${x},${y}`, "--device", deviceId], {});
	}

	public static sendKeys(deviceId: string, text: string): void {
		execFileSync(getMobilecliPath(), ["io", "text", text, "--device", deviceId], {});
	}

	public static openUrl(deviceId: string, url: string): void {
		execFileSync(getMobilecliPath(), ["url", url, "--device", deviceId], {});
	}
}

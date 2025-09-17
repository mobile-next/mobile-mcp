import { Socket } from "node:net";
import { execFileSync } from "node:child_process";

import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenSize, SwipeDirection, ScreenElement, Orientation } from "./robot";
import { Mobilecli, getMobilecliPath } from "./mobilecli";

const WDA_PORT = 8100;
const IOS_TUNNEL_PORT = 60105;

interface InfoCommandOutput {
	DeviceClass: string;
	DeviceName: string;
	ProductName: string;
	ProductType: string;
	ProductVersion: string;
	PhoneNumber: string;
	TimeZone: string;
}

interface MobilecliResponse<T> {
	status: string;
	data: T;
}


interface MobilecliDevice {
	id: string;
	name: string;
	platform: string;
	type: string;
}

interface MobilecliDevicesResponse {
	devices: MobilecliDevice[];
}

export interface IosDevice {
	deviceId: string;
	deviceName: string;
}


export class IosRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	private isListeningOnPort(port: number): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const client = new Socket();
			client.connect(port, "localhost", () => {
				client.destroy();
				resolve(true);
			});

			client.on("error", (err: any) => {
				resolve(false);
			});
		});
	}

	private async isTunnelRunning(): Promise<boolean> {
		return await this.isListeningOnPort(IOS_TUNNEL_PORT);
	}

	private async isWdaForwardRunning(): Promise<boolean> {
		return await this.isListeningOnPort(WDA_PORT);
	}

	private async wda(): Promise<WebDriverAgent> {

		if (!(await this.isWdaForwardRunning())) {
			throw new ActionableError("Port forwarding to WebDriverAgent is not running (tunnel okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on device (tunnel okay, port forwarding okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		return wda;
	}


	public async getIosVersion(): Promise<string> {
		const output = execFileSync(getMobilecliPath(), ["--device", this.deviceId, "device", "info"], {}).toString();
		const response: MobilecliResponse<InfoCommandOutput> = JSON.parse(output);
		if (response.status !== "ok") {
			throw new Error(`Failed to get device info: ${response.status}`);
		}

		return response.data.ProductVersion;
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const wda = await this.wda();
		return await wda.getScreenSize();
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const wda = await this.wda();
		await wda.swipe(direction);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const wda = await this.wda();
		await wda.swipeFromCoordinate(x, y, direction, distance);
	}

	public async listApps(): Promise<InstalledApp[]> {
		return await Mobilecli.listApps(this.deviceId);
	}

	public async launchApp(packageName: string): Promise<void> {
		Mobilecli.launchApp(this.deviceId, packageName);
	}

	public async terminateApp(packageName: string): Promise<void> {
		Mobilecli.terminateApp(this.deviceId, packageName);
	}

	public async openUrl(url: string): Promise<void> {
		const wda = await this.wda();
		await wda.openUrl(url);
	}

	public async sendKeys(text: string): Promise<void> {
		const wda = await this.wda();
		await wda.sendKeys(text);
	}

	public async pressButton(button: Button): Promise<void> {
		const wda = await this.wda();
		await wda.pressButton(button);
	}

	public async tap(x: number, y: number): Promise<void> {
		const wda = await this.wda();
		await wda.tap(x, y);
	}

	public async longPress(x: number, y: number): Promise<void> {
		const wda = await this.wda();
		await wda.longPress(x, y);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return await wda.getElementsOnScreen();
	}

	public async getScreenshot(): Promise<Buffer> {
		return Mobilecli.getScreenshot(this.deviceId);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const wda = await this.wda();
		await wda.setOrientation(orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		const wda = await this.wda();
		return await wda.getOrientation();
	}
}

export class IosManager {

	public isMobilecliInstalled(): boolean {
		try {
			const output = execFileSync(getMobilecliPath(), ["--version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
			return output.includes("mobilecli");
		} catch (error) {
			return false;
		}
	}

	public getDeviceName(deviceId: string): string {
		const output = execFileSync(getMobilecliPath(), ["device", "info", "--device", deviceId]).toString();
		const response: MobilecliResponse<InfoCommandOutput> = JSON.parse(output);
		if (response.status !== "ok") {
			throw new Error(`Failed to get device info: ${response.status}`);
		}

		return response.data.DeviceName;
	}

	public listDevices(): IosDevice[] {
		if (!this.isMobilecliInstalled()) {
			console.error("mobilecli is not installed, no physical iOS devices can be detected");
			return [];
		}

		const output = execFileSync(getMobilecliPath(), ["devices"]).toString();
		const response: MobilecliResponse<MobilecliDevicesResponse> = JSON.parse(output);
		if (response.status !== "ok") {
			throw new Error(`Failed to list devices: ${response.status}`);
		}

		return response.data.devices
			.filter(device => device.platform === "ios" && device.type === "real")
			.map(device => ({
				deviceId: device.id,
				deviceName: device.name,
			}));
	}
}

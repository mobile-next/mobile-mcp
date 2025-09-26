import { Button, InstalledApp, Robot, ScreenSize, SwipeDirection, ScreenElement, Orientation } from "./robot";
import { Mobilecli } from "./mobilecli";

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

export interface IosDevice {
	deviceId: string;
	deviceName: string;
}

export class IosRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	public async getIosVersion(): Promise<string> {
		const output = Mobilecli.getDeviceInfo(this.deviceId);
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
		return Mobilecli.isInstalled();
	}

	public getDeviceName(deviceId: string): string {
		const output = Mobilecli.getDeviceInfoByDeviceId(deviceId);
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

		const devices = Mobilecli.listDevices();
		return devices
			.filter(device => device.platform === "ios" && device.type === "real")
			.map(device => ({
				deviceId: device.id,
				deviceName: device.name,
			}));
	}
}

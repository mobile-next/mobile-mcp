import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection, Orientation } from "./robot";
import { Mobilecli } from "./mobilecli";

export interface Simulator {
	name: string;
	uuid: string;
	state: string;
}

export class Simctl implements Robot {

	constructor(private readonly deviceId: string) {}

	private async wda(): Promise<WebDriverAgent> {
		throw new ActionableError("WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/");
	}

	public async getScreenshot(): Promise<Buffer> {
		return Mobilecli.getScreenshot(this.deviceId);
	}

	public async openUrl(url: string) {
		return Mobilecli.openUrl(this.deviceId, url);
	}

	public async launchApp(packageName: string): Promise<void> {
		Mobilecli.launchApp(this.deviceId, packageName);
	}

	public async terminateApp(packageName: string): Promise<void> {
		Mobilecli.terminateApp(this.deviceId, packageName);
	}

	public async listApps(): Promise<InstalledApp[]> {
		return await Mobilecli.listApps(this.deviceId);
	}

	public async getScreenSize(): Promise<ScreenSize> {
		return Mobilecli.getScreenSize(this.deviceId);
	}

	public async sendKeys(keys: string) {
		return Mobilecli.sendKeys(this.deviceId, keys);
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const wda = await this.wda();
		return wda.swipe(direction);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const wda = await this.wda();
		return wda.swipeFromCoordinate(x, y, direction, distance);
	}

	public async tap(x: number, y: number) {
		return Mobilecli.tap(this.deviceId, x, y);
	}

	public async longPress(x: number, y: number) {
		const wda = await this.wda();
		return wda.longPress(x, y);
	}

	public async pressButton(button: Button) {
		return Mobilecli.pressButton(this.deviceId, button);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return wda.getElementsOnScreen();
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const wda = await this.wda();
		return wda.setOrientation(orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		const wda = await this.wda();
		return wda.getOrientation();
	}
}

export class SimctlManager {

	public listSimulators(): Simulator[] {
		const devices = Mobilecli.listDevices();
		return devices
			.filter(device => device.platform === "ios" && device.type === "simulator")
			.map(device => ({
				name: device.name,
				uuid: device.id,
				state: "Booted",
			}));
	}

	public listBootedSimulators(): Simulator[] {
		return this.listSimulators()
			.filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(deviceId: string): Simctl {
		return new Simctl(deviceId);
	}
}

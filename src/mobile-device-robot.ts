import {
	Robot,
	ScreenSize,
	SwipeDirection,
	InstalledApp,
	Button,
	Orientation,
	ScreenElement,
} from "./robot";
import { Mobilecli } from "./mobilecli";

export class MobileDeviceRobot implements Robot {
	private deviceId: string;

	constructor(deviceId: string) {
		this.deviceId = deviceId;
	}

	async getScreenSize(): Promise<ScreenSize> {
		return Mobilecli.getScreenSize(this.deviceId);
	}

	async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width / 2;
		const centerY = screenSize.height / 2;
		const margin = 100;

		let x1: number, y1: number, x2: number, y2: number;

		switch (direction) {
			case "up":
				x1 = centerX;
				y1 = screenSize.height - margin;
				x2 = centerX;
				y2 = margin;
				break;
			case "down":
				x1 = centerX;
				y1 = margin;
				x2 = centerX;
				y2 = screenSize.height - margin;
				break;
			case "left":
				x1 = screenSize.width - margin;
				y1 = centerY;
				x2 = margin;
				y2 = centerY;
				break;
			case "right":
				x1 = margin;
				y1 = centerY;
				x2 = screenSize.width - margin;
				y2 = centerY;
				break;
		}

		Mobilecli.swipe(this.deviceId, x1, y1, x2, y2);
	}

	async swipeFromCoordinate(
		x: number,
		y: number,
		direction: SwipeDirection,
		distance: number = 200
	): Promise<void> {
		let x2: number, y2: number;

		switch (direction) {
			case "up":
				x2 = x;
				y2 = y - distance;
				break;
			case "down":
				x2 = x;
				y2 = y + distance;
				break;
			case "left":
				x2 = x - distance;
				y2 = y;
				break;
			case "right":
				x2 = x + distance;
				y2 = y;
				break;
		}

		Mobilecli.swipe(this.deviceId, x, y, x2, y2);
	}

	async getScreenshot(): Promise<Buffer> {
		return Mobilecli.getScreenshot(this.deviceId);
	}

	async listApps(): Promise<InstalledApp[]> {
		return Mobilecli.listApps(this.deviceId);
	}

	async launchApp(packageName: string): Promise<void> {
		Mobilecli.launchApp(this.deviceId, packageName);
	}

	async terminateApp(packageName: string): Promise<void> {
		Mobilecli.terminateApp(this.deviceId, packageName);
	}

	async installApp(path: string): Promise<void> {
		throw new Error("installApp not yet implemented");
	}

	async uninstallApp(bundleId: string): Promise<void> {
		throw new Error("uninstallApp not yet implemented");
	}

	async openUrl(url: string): Promise<void> {
		Mobilecli.openUrl(this.deviceId, url);
	}

	async sendKeys(text: string): Promise<void> {
		Mobilecli.sendKeys(this.deviceId, text);
	}

	async pressButton(button: Button): Promise<void> {
		Mobilecli.pressButton(this.deviceId, button);
	}

	async tap(x: number, y: number): Promise<void> {
		Mobilecli.tap(this.deviceId, x, y);
	}

	async longPress(x: number, y: number): Promise<void> {
		Mobilecli.longPress(this.deviceId, x, y);
	}

	async getElementsOnScreen(): Promise<ScreenElement[]> {
		return Mobilecli.getElementsOnScreen(this.deviceId);
	}

	async setOrientation(orientation: Orientation): Promise<void> {
		Mobilecli.setOrientation(this.deviceId, orientation);
	}

	async getOrientation(): Promise<Orientation> {
		return Mobilecli.getOrientation(this.deviceId);
	}
}

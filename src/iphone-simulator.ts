import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection, Orientation } from "./robot";
import { Mobilecli } from "./mobilecli";

export class MobileDeviceRobot implements Robot {

	constructor(private readonly deviceId: string) {}

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
		const screenSize = await this.getScreenSize();
		let x0: number, y0: number, x1: number, y1: number;

		// Use 60% of the width/height for swipe distance
		const verticalDistance = Math.floor(screenSize.height * 0.6);
		const horizontalDistance = Math.floor(screenSize.width * 0.6);
		const centerX = Math.floor(screenSize.width / 2);
		const centerY = Math.floor(screenSize.height / 2);

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = centerY + Math.floor(verticalDistance / 2);
				y1 = centerY - Math.floor(verticalDistance / 2);
				break;

			case "down":
				x0 = x1 = centerX;
				y0 = centerY - Math.floor(verticalDistance / 2);
				y1 = centerY + Math.floor(verticalDistance / 2);
				break;

			case "left":
				y0 = y1 = centerY;
				x0 = centerX + Math.floor(horizontalDistance / 2);
				x1 = centerX - Math.floor(horizontalDistance / 2);
				break;

			case "right":
				y0 = y1 = centerY;
				x0 = centerX - Math.floor(horizontalDistance / 2);
				x1 = centerX + Math.floor(horizontalDistance / 2);
				break;

			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		return Mobilecli.swipe(this.deviceId, x0, y0, x1, y1);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance: number = 400): Promise<void> {
		const x0 = x;
		const y0 = y;
		let x1 = x;
		let y1 = y;

		// Calculate target position based on direction and distance
		switch (direction) {
			case "up":
				y1 = y - distance; // Move up by specified distance
				break;

			case "down":
				y1 = y + distance; // Move down by specified distance
				break;

			case "left":
				x1 = x - distance; // Move left by specified distance
				break;

			case "right":
				x1 = x + distance; // Move right by specified distance
				break;

			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		return Mobilecli.swipe(this.deviceId, x0, y0, x1, y1);
	}

	public async tap(x: number, y: number) {
		return Mobilecli.tap(this.deviceId, x, y);
	}

	public async longPress(x: number, y: number) {
		return Mobilecli.longPress(this.deviceId, x, y);
	}

	public async pressButton(button: Button) {
		return Mobilecli.pressButton(this.deviceId, button);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		return Mobilecli.getElementsOnScreen(this.deviceId);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		return Mobilecli.setOrientation(this.deviceId, orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		return Mobilecli.getOrientation(this.deviceId);
	}
}

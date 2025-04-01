export interface Bounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface ElementCoordinates {
	x: number,
	y: number;
}

export interface Dimensions {
	width: number;
	height: number;
}

export type SwipeDirection = "up" | "down" | "left" | "right";

export type Button = "HOME" | "BACK" | "VOLUME_UP" | "VOLUME_DOWN" | "ENTER";

export interface Robot {
	getScreenSize(): Promise<Dimensions>;
	swipe(direction: SwipeDirection): Promise<void>;
	getScreenshot(): Promise<Buffer>;
	listApps(): Promise<string[]>;
	launchApp(packageName: string): Promise<void>;
	terminateApp(packageName: string): Promise<void>;
	openUrl(url: string): Promise<void>;
	sendKeys(text: string): Promise<void>;
	pressButton(button: Button): Promise<void>;
	tap(x: number, y: number): Promise<void>;
}

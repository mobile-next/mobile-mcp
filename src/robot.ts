export interface Dimensions {
	width: number;
	height: number;
}

export interface ScreenSize extends Dimensions {
	scale: number;
}

export interface InstalledApp {
	packageName: string;
	appName: string;
}

export type SwipeDirection = "up" | "down" | "left" | "right";

export type Button = "HOME" | "BACK" | "VOLUME_UP" | "VOLUME_DOWN" | "ENTER" | "DPAD_CENTER" | "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT";

export interface ScreenElementRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenElement {
	type: string;
	label?: string;
	text?: string;
	name?: string;
	value?: string;
	identifier?: string;
	rect: ScreenElementRect;

	// short reference from the latest ui dump (e.g. "e5"), mobilecli only
	ref?: string;

	// currently only on android tv
	focused?: boolean;
	selected?: boolean;
	checked?: boolean;
	enabled?: boolean;
}

export class ActionableError extends Error {
	constructor(message: string) {
		super(message);
	}
}


export type Orientation = "portrait" | "landscape";

export interface ScreenshotOptions {
	format?: "png" | "jpeg";
	quality?: number;
	scale?: number;
	maxSize?: number;
}

export interface Robot {
	/**
	 * Get the screen size of the device in pixels.
	 */
	getScreenSize(): Promise<ScreenSize>;

	/**
	 * Swipe in a direction.
	 */
	swipe(direction: SwipeDirection): Promise<void>;

	/**
	 * Swipe from a specific coordinate in a direction.
	 */
	swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void>;

	/**
	 * Get a screenshot of the screen. Returns a PNG image by default.
	 * Robots that support it may honor options (format, quality, scale,
	 * maxSize); others ignore them and return a full-size PNG.
	 */
	getScreenshot(options?: ScreenshotOptions): Promise<Buffer>;

	/**
	 * List all installed apps on the device. Returns an array of package names (or
	 * bundle identifiers in iOS) for all installed apps.
	 */
	listApps(): Promise<InstalledApp[]>;

	/**
	 * Get the app currently in the foreground. Optional, not all robots support it.
	 */
	getForegroundApp?(): Promise<InstalledApp>;

	/**
	 * Override the GPS location reported by the device. Optional, not all robots support it.
	 */
	setLocation?(latitude: number, longitude: number): Promise<void>;

	/**
	 * Remove the GPS location override. Optional, not all robots support it.
	 */
	clearLocation?(): Promise<void>;

	/**
	 * Read the device clipboard. Optional, not all robots support it.
	 */
	getClipboard?(): Promise<string>;

	/**
	 * Replace the device clipboard. Optional, not all robots support it.
	 */
	setClipboard?(text: string): Promise<void>;

	/**
	 * Collect device logs until `limit` entries arrive or `timeoutMs` passes. Returns raw NDJSON lines.
	 * Filters use key=value or key!=value syntax. Optional, not all robots support it.
	 */
	getLogs?(limit: number, filters: string[], timeoutMs: number): Promise<string>;

	/**
	 * Launch an app.
	 */
	launchApp(packageName: string, locale?: string): Promise<void>;

	/**
	 * Terminate an app. If app was already terminated (or non existent) then this
	 * is a no-op.
	 */
	terminateApp(packageName: string): Promise<void>;

	/**
	 * Install an app on the device from a file path.
	 */
	installApp(path: string): Promise<void>;

	/**
	 * Uninstall an app from the device.
	 */
	uninstallApp(bundleId: string): Promise<void>;

	/**
	 * Open a URL in the device's web browser. Can be an https:// url, or a
	 * custom scheme (e.g. "myapp://").
	 */
	openUrl(url: string): Promise<void>;

	/**
	 * Send keys to the device, simulating keyboard input.
	 */
	sendKeys(text: string): Promise<void>;

	/**
	 * Press a button on the device, simulating a physical button press.
	 */
	pressButton(button: Button): Promise<void>;

	/**
	 * Tap on a specific coordinate on the screen.
	 */
	tap(x: number, y: number): Promise<void>;

	/**
	 * Tap on a specific coordinate on the screen.
	 */
	doubleTap(x: number, y: number): Promise<void>;

	/**
	 * Long press on a specific coordinate on the screen.
	 * @param x - The x coordinate to long press
	 * @param y - The y coordinate to long press
	 * @param duration - Duration of the long press in milliseconds
	 */
	longPress(x: number, y: number, duration: number): Promise<void>;

	/**
	 * Get all elements on the screen. Works only on native apps (not webviews). Will
	 * return a filtered list of elements that make sense to interact with.
	 */
	getElementsOnScreen(): Promise<ScreenElement[]>;

	/**
	 * Change the screen orientation of the device.
	 * @param orientation The desired orientation ("portrait" or "landscape")
	 */
	setOrientation(orientation: Orientation): Promise<void>;

	/**
	 * Get the current screen orientation.
	 */
	getOrientation(): Promise<Orientation>;
}

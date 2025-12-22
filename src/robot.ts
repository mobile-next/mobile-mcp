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

	// currently only on android tv
	focused?: boolean;
}

export class ActionableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ActionableError";
	}
}

/**
 * Extracts a user-friendly error message from a command execution error.
 * Handles both stdout and stderr from child process errors.
 */
export function extractCommandError(error: any): string {
	const stdout = error.stdout ? error.stdout.toString().trim() : "";
	const stderr = error.stderr ? error.stderr.toString().trim() : "";
	const combined = [stdout, stderr].filter(Boolean).join(" ");
	return combined || error.message || "Unknown error occurred";
}

/**
 * Wraps a command execution in consistent error handling.
 * Converts any error to an ActionableError with a user-friendly message.
 */
export async function withActionableError<T>(
	operation: () => T | Promise<T>,
	errorContext: string
): Promise<T> {
	try {
		return await operation();
	} catch (error: any) {
		const errorMessage = extractCommandError(error);
		throw new ActionableError(`${errorContext}: ${errorMessage}`);
	}
}

export type Orientation = "portrait" | "landscape";

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
	 * Get a screenshot of the screen. Returns a Buffer that contains
	 * a PNG image of the screen. Will be same dimensions as getScreenSize().
	 */
	getScreenshot(): Promise<Buffer>;

	/**
	 * List all installed apps on the device. Returns an array of package names (or
	 * bundle identifiers in iOS) for all installed apps.
	 */
	listApps(): Promise<InstalledApp[]>;

	/**
	 * Launch an app.
	 */
	launchApp(packageName: string): Promise<void>;

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
	 */
	longPress(x: number, y: number): Promise<void>;

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

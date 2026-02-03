import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import * as xml from "fast-xml-parser";

import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenElementRect, ScreenSize, SwipeDirection, Orientation } from "./robot";

export interface AndroidDevice {
	deviceId: string;
	deviceType: "tv" | "mobile";
}

export interface LogcatDumpOptions {
	lines?: number; // default 200, max 2000
	format?: LogcatFormat; // default threadtime
	buffers?: LogcatBuffer[]; // default ["main", "crash"]
	minPriority?: LogcatPriority; // default I
	pid?: number;
	packageName?: string;
	includeRegex?: string;
	excludeRegex?: string;
}


interface UiAutomatorXmlNode {
	node: UiAutomatorXmlNode[];
	class?: string;
	text?: string;
	bounds?: string;
	hint?: string;
	focused?: string;
	checkable?: string;
	"content-desc"?: string;
	"resource-id"?: string;
}

interface UiAutomatorXml {
	hierarchy: {
		node: UiAutomatorXmlNode;
	};
}

const getAdbPath = (): string => {
	const exeName = process.env.platform === "win32" ? "adb.exe" : "adb";
	if (process.env.ANDROID_HOME) {
		return path.join(process.env.ANDROID_HOME, "platform-tools", exeName);
	}

	if (process.platform === "win32" && process.env.LOCALAPPDATA) {
		const windowsAdbPath = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe");
		if (existsSync(windowsAdbPath)) {
			return windowsAdbPath;
		}
	}

	if (process.platform === "darwin" && process.env.HOME) {
		const defaultAndroidSdk = path.join(process.env.HOME, "Library", "Android", "sdk", "platform-tools", "adb");
		if (existsSync(defaultAndroidSdk)) {
			return defaultAndroidSdk;
		}
	}

	// fallthrough, hope for the best
	return exeName;
};

const BUTTON_MAP: Record<Button, string> = {
	"BACK": "KEYCODE_BACK",
	"HOME": "KEYCODE_HOME",
	"VOLUME_UP": "KEYCODE_VOLUME_UP",
	"VOLUME_DOWN": "KEYCODE_VOLUME_DOWN",
	"ENTER": "KEYCODE_ENTER",
	"DPAD_CENTER": "KEYCODE_DPAD_CENTER",
	"DPAD_UP": "KEYCODE_DPAD_UP",
	"DPAD_DOWN": "KEYCODE_DPAD_DOWN",
	"DPAD_LEFT": "KEYCODE_DPAD_LEFT",
	"DPAD_RIGHT": "KEYCODE_DPAD_RIGHT",
};

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

const clampInt = (value: any, defaultValue: number, min: number, max: number): number => {
	const n = Number(value);
	if (!Number.isFinite(n)) {return defaultValue;}
	return Math.max(min, Math.min(max, Math.floor(n)));
};

const truncateText = (text: string, maxChars: number): { text: string; truncated: boolean } => {
	if (text.length <= maxChars) {return { text, truncated: false };}
	return { text: text.slice(0, maxChars) + "\n\n[OUTPUT TRUNCATED - Use packageName, minPriority, includeRegex, or excludeRegex filters to reduce output]\n", truncated: true };
};

type AndroidDeviceType = "tv" | "mobile";

type LogcatBuffer = "main" | "crash" | "system";
type LogcatFormat = "threadtime" | "time" | "brief";
type LogcatPriority = "V" | "D" | "I" | "W" | "E" | "F";


export class AndroidRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	public adb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	public silentAdb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
			stdio: ["pipe", "pipe", "pipe"],
		});
	}

	public getSystemFeatures(): string[] {
		return this.adb("shell", "pm", "list", "features")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("feature:"))
			.map(line => line.substring("feature:".length));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const screenSize = this.adb("shell", "wm", "size")
			.toString()
			.split(" ")
			.pop();

		if (!screenSize) {
			throw new Error("Failed to get screen size");
		}

		const scale = 1;
		const [width, height] = screenSize.split("x").map(Number);
		return { width, height, scale };
	}

	public async listApps(): Promise<InstalledApp[]> {
		// only apps that have a launcher activity are returned
		return this.adb("shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("packageName="))
			.map(line => line.substring("packageName=".length))
			.filter((value, index, self) => self.indexOf(value) === index)
			.map(packageName => ({
				packageName,
				appName: packageName,
			}));
	}

	private async listPackages(): Promise<string[]> {
		return this.adb("shell", "pm", "list", "packages")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("package:"))
			.map(line => line.substring("package:".length));
	}

	public async launchApp(packageName: string): Promise<void> {
		try {
			this.silentAdb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
		} catch (error) {
			throw new ActionableError(`Failed launching app with package name "${packageName}", please make sure it exists`);
		}
	}

	public async listRunningProcesses(): Promise<string[]> {
		return this.adb("shell", "ps", "-e")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("u")) // non-system processes
			.map(line => line.split(/\s+/)[8]); // get process name
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.80);
				y1 = Math.floor(screenSize.height * 0.20);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.20);
				y1 = Math.floor(screenSize.height * 0.80);
				break;
			case "left":
				x0 = Math.floor(screenSize.width * 0.80);
				x1 = Math.floor(screenSize.width * 0.20);
				y0 = y1 = Math.floor(screenSize.height * 0.50);
				break;
			case "right":
				x0 = Math.floor(screenSize.width * 0.20);
				x1 = Math.floor(screenSize.width * 0.80);
				y0 = y1 = Math.floor(screenSize.height * 0.50);
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const screenSize = await this.getScreenSize();

		let x0: number, y0: number, x1: number, y1: number;

		// Use provided distance or default to 30% of screen dimension
		const defaultDistanceY = Math.floor(screenSize.height * 0.3);
		const defaultDistanceX = Math.floor(screenSize.width * 0.3);
		const swipeDistanceY = distance || defaultDistanceY;
		const swipeDistanceX = distance || defaultDistanceX;

		switch (direction) {
			case "up":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.max(0, y - swipeDistanceY);
				break;
			case "down":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.min(screenSize.height, y + swipeDistanceY);
				break;
			case "left":
				x0 = x;
				x1 = Math.max(0, x - swipeDistanceX);
				y0 = y1 = y;
				break;
			case "right":
				x0 = x;
				x1 = Math.min(screenSize.width, x + swipeDistanceX);
				y0 = y1 = y;
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
	}

	private getDisplayCount(): number {
		return this.adb("shell", "dumpsys", "SurfaceFlinger", "--display-id")
			.toString()
			.split("\n")
			.filter(s => s.startsWith("Display "))
			.length;
	}

	private getFirstDisplayId(): string | null {
		try {
			// Try using cmd display get-displays (Android 11+)
			const displays = this.adb("shell", "cmd", "display", "get-displays")
				.toString()
				.split("\n")
				.filter(s => s.startsWith("Display id "))
				// filter for state ON even though get-displays only returns turned on displays
				.filter(s => s.indexOf(", state ON,") >= 0)
				// another paranoia check
				.filter(s => s.indexOf(", uniqueId ") >= 0);

			if (displays.length > 0) {
				const m = displays[0].match(/uniqueId \"([^\"]+)\"/);
				if (m !== null) {
					let displayId = m[1];
					if (displayId.startsWith("local:")) {
						displayId = displayId.substring("local:".length);
					}

					return displayId;
				}
			}
		} catch (error) {
			// cmd display get-displays not available on this device
		}

		// fallback: parse dumpsys display for display info (compatible with older Android versions)
		try {
			const dumpsys = this.adb("shell", "dumpsys", "display")
				.toString();

			// look for DisplayViewport entries with isActive=true and type=INTERNAL
			const viewportMatch = dumpsys.match(/DisplayViewport\{type=INTERNAL[^}]*isActive=true[^}]*uniqueId='([^']+)'/);
			if (viewportMatch) {
				let uniqueId = viewportMatch[1];
				if (uniqueId.startsWith("local:")) {
					uniqueId = uniqueId.substring("local:".length);
				}

				return uniqueId;
			}

			// fallback: look for active display with state ON
			const displayStateMatch = dumpsys.match(/Display Id=(\d+)[\s\S]*?Display State=ON/);
			if (displayStateMatch) {
				return displayStateMatch[1];
			}
		} catch (error) {
			// dumpsys display also failed
		}

		return null;
	}

	public async getScreenshot(): Promise<Buffer> {
		if (this.getDisplayCount() <= 1) {
			// backward compatibility for android 10 and below, and for single display devices
			return this.adb("exec-out", "screencap", "-p");
		}

		// find the first display that is turned on, and capture that one
		const displayId = this.getFirstDisplayId();
		if (displayId === null) {
			// no idea why, but we have displayCount >= 2, yet we failed to parse
			// let's go with screencap's defaults and hope for the best
			return this.adb("exec-out", "screencap", "-p");
		}

		return this.adb("exec-out", "screencap", "-p", "-d", `${displayId}`);
	}

	private collectElements(node: UiAutomatorXmlNode): ScreenElement[] {
		const elements: Array<ScreenElement> = [];

		if (node.node) {
			if (Array.isArray(node.node)) {
				for (const childNode of node.node) {
					elements.push(...this.collectElements(childNode));
				}
			} else {
				elements.push(...this.collectElements(node.node));
			}
		}

		if (node.text || node["content-desc"] || node.hint || node["resource-id"] || node.checkable === "true") {
			const element: ScreenElement = {
				type: node.class || "text",
				text: node.text,
				label: node["content-desc"] || node.hint || "",
				rect: this.getScreenElementRect(node),
			};

			if (node.focused === "true") {
				// only provide it if it's true, otherwise don't confuse llm
				element.focused = true;
			}

			const resourceId = node["resource-id"];
			if (resourceId !== null && resourceId !== "") {
				element.identifier = resourceId;
			}

			if (element.rect.width > 0 && element.rect.height > 0) {
				elements.push(element);
			}
		}

		return elements;
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const parsedXml = await this.getUiAutomatorXml();
		const hierarchy = parsedXml.hierarchy;
		const elements = this.collectElements(hierarchy.node);
		return elements;
	}

	public async terminateApp(packageName: string): Promise<void> {
		this.adb("shell", "am", "force-stop", packageName);
	}

	public async installApp(path: string): Promise<void> {
		try {
			this.adb("install", "-r", path);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			this.adb("uninstall", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async openUrl(url: string): Promise<void> {
		this.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url);
	}

	private isAscii(text: string): boolean {
		return /^[\x00-\x7F]*$/.test(text);
	}

	private escapeShellText(text: string): string {
		// escape all shell special characters that could be used for injection
		return text.replace(/[\\'"` \t\n\r|&;()<>{}[\]$*?]/g, "\\$&");
	}

	private async isDeviceKitInstalled(): Promise<boolean> {
		const packages = await this.listPackages();
		return packages.includes("com.mobilenext.devicekit");
	}

	public async sendKeys(text: string): Promise<void> {
		if (text === "") {
			// bailing early, so we don't run adb shell with empty string.
			// this happens when you prompt with a simple "submit".
			return;
		}

		if (this.isAscii(text)) {
			// adb shell input only supports ascii characters. and
			// some of the keys have to be escaped.
			const _text = this.escapeShellText(text);
			this.adb("shell", "input", "text", _text);
		} else if (await this.isDeviceKitInstalled()) {
			// try sending over clipboard
			const base64 = Buffer.from(text).toString("base64");

			// send clipboard over and immediately paste it
			this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.set", "-e", "encoding", "base64", "-e", "text", base64, "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
			this.adb("shell", "input", "keyevent", "KEYCODE_PASTE");

			// clear clipboard when we're done
			this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.clear", "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
		} else {
			throw new ActionableError("Non-ASCII text is not supported on Android, please install mobilenext devicekit, see https://github.com/mobile-next/devicekit-android");
		}
	}

	public async pressButton(button: Button) {
		if (!BUTTON_MAP[button]) {
			throw new ActionableError(`Button "${button}" is not supported`);
		}

		const mapped = BUTTON_MAP[button];
		this.adb("shell", "input", "keyevent", mapped);
	}

	public async tap(x: number, y: number): Promise<void> {
		this.adb("shell", "input", "tap", `${x}`, `${y}`);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		// a long press is a swipe with no movement and a long duration
		this.adb("shell", "input", "swipe", `${x}`, `${y}`, `${x}`, `${y}`, `${duration}`);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		await this.tap(x, y);
		await new Promise(r => setTimeout(r, 100)); // short delay
		await this.tap(x, y);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const value = orientation === "portrait" ? 0 : 1;

		// disable auto-rotation prior to setting the orientation
		this.adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
		this.adb("shell", "content", "insert", "--uri", "content://settings/system", "--bind", "name:s:user_rotation", "--bind", `value:i:${value}`);
	}

	public async getOrientation(): Promise<Orientation> {
		const rotation = this.adb("shell", "settings", "get", "system", "user_rotation").toString().trim();
		return rotation === "0" ? "portrait" : "landscape";
	}

	private async getUiAutomatorDump(): Promise<string> {
		for (let tries = 0; tries < 10; tries++) {
			const dump = this.adb("exec-out", "uiautomator", "dump", "/dev/tty").toString();
			// note: we're not catching other errors here. maybe we should check for <?xml
			if (dump.includes("null root node returned by UiTestAutomationBridge")) {
				// uncomment for debugging
				// const screenshot = await this.getScreenshot();
				// console.error("Failed to get UIAutomator XML. Here's a screenshot: " + screenshot.toString("base64"));
				continue;
			}

			return dump.substring(dump.indexOf("<?xml"));
		}

		throw new ActionableError("Failed to get UIAutomator XML");
	}

	private async getUiAutomatorXml(): Promise<UiAutomatorXml> {
		const dump = await this.getUiAutomatorDump();
		const parser = new xml.XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "",
		});

		return parser.parse(dump) as UiAutomatorXml;
	}

	private getScreenElementRect(node: UiAutomatorXmlNode): ScreenElementRect {
		const bounds = String(node.bounds);

		const [, left, top, right, bottom] = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.map(Number) || [];
		return {
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	public async logcatDump(opts: LogcatDumpOptions): Promise<{
		text: string;
		truncated: boolean;
		meta: {
			linesRequested: number;
			format: LogcatFormat;
			buffers: LogcatBuffer[];
			minPriority: LogcatPriority;
			pidRequested?: number;
			pidResolved?: number;
			pidFilterMode?: "logcat--pid" | "client-side" | "none";
		};
	}> {
		const linesRequested = clampInt(opts.lines, 200, 1, 500);
		const format: LogcatFormat = opts.format ?? "threadtime";
		const buffers: LogcatBuffer[] = (opts.buffers && opts.buffers.length > 0) ? opts.buffers : ["main", "crash"];
		const minPriority: LogcatPriority = opts.minPriority ?? "I";

		let pidResolved: number | undefined = opts.pid;

		// Resolve PID from packageName if requested
		if (!pidResolved && opts.packageName) {
			pidResolved = await this.tryResolvePid(opts.packageName);
		}

		const baseArgs: string[] = ["shell", "logcat", "-d", "-v", format];
		for (const b of buffers) {
			baseArgs.push("-b", b);
		}
		baseArgs.push("-t", String(linesRequested), `*:${minPriority}`);

		let output = "";
		let pidFilterMode: "logcat--pid" | "client-side" | "none" = "none";

		// First try: use logcat --pid if pid is available (not supported on all Android builds)
		if (pidResolved) {
			try {
				const buf = this.silentAdb(...baseArgs, "--pid", String(pidResolved));
				output = buf.toString();
				pidFilterMode = "logcat--pid";
			} catch (e) {
				// Fallback: run without --pid and filter client-side
				const buf = this.silentAdb(...baseArgs);
				output = buf.toString();
				pidFilterMode = "client-side";
			}
		} else {
			const buf = this.silentAdb(...baseArgs);
			output = buf.toString();
			pidFilterMode = "none";
		}

		// Normalize + filter lines
		let lines = output.split("\n").filter(l => l.length > 0);

		// Client-side PID filter fallback (only supported for threadtime format)
		if (pidResolved && pidFilterMode === "client-side") {
			if (format === "threadtime") {
				// threadtime format: "MM-DD HH:MM:SS.mmm  PID  TID PRIORITY/TAG: message"
				// PID is column index 2 (0-indexed) when split by whitespace
				lines = lines.filter(l => {
					const cols = l.trim().split(/\s+/);
					if (cols.length < 3) {return false;}
					const linePid = Number(cols[2]);
					return linePid === pidResolved;
				});
			} else {
				// For non-threadtime formats (time, brief), PID column position varies or is absent
				// Skip client-side filtering to avoid incorrect matches
				console.warn(`Client-side PID filtering is only supported for threadtime format, skipping for format "${format}".`);
			}
		}

		// include/exclude regex filters
		if (opts.includeRegex) {
			try {
				const re = new RegExp(opts.includeRegex);
				lines = lines.filter(l => re.test(l));
			} catch (e) {
				console.error(`Invalid includeRegex pattern "${opts.includeRegex}": ${(e as Error).message}. Skipping include filter.`);
			}
		}
		if (opts.excludeRegex) {
			try {
				const re = new RegExp(opts.excludeRegex);
				lines = lines.filter(l => !re.test(l));
			} catch (e) {
				console.error(`Invalid excludeRegex pattern "${opts.excludeRegex}": ${(e as Error).message}. Skipping exclude filter.`);
			}
		}

		const finalText = lines.join("\n") + (lines.length ? "\n" : "");
		const { text, truncated } = truncateText(finalText, 80_000);

		return {
			text,
			truncated,
			meta: {
				linesRequested,
				format,
				buffers,
				minPriority,
				pidRequested: opts.pid,
				pidResolved,
				pidFilterMode,
			},
		};
	}

	private async tryResolvePid(packageName: string): Promise<number | undefined> {
		// 1) pidof <package>
		try {
			const out = this.silentAdb("shell", "pidof", packageName).toString().trim();
			// pidof may return multiple PIDs separated by spaces
			const first = out.split(/\s+/)[0];
			const pid = Number(first);
			if (Number.isFinite(pid)) {return pid;}
		} catch (e) {
			// ignore
		}

		// 2) fallback: ps -A | grep <package>
		try {
			const out = this.silentAdb("shell", "ps", "-A").toString();
			// ps output: USER PID ... NAME  (NAME is the last column)
			// Require exact match on NAME column to avoid partial package name matches
			const line = out.split("\n").find(l => {
				const cols = l.trim().split(/\s+/);
				if (cols.length < 2) {return false;}
				const name = cols[cols.length - 1];
				return name === packageName;
			});
			if (!line) {return undefined;}

			const cols = line.trim().split(/\s+/);
			const pid = Number(cols[1]);
			if (Number.isFinite(pid)) {return pid;}

			return undefined;
		} catch (e) {
			return undefined;
		}
	}
}

export class AndroidDeviceManager {

	private getDeviceType(name: string): AndroidDeviceType {
		const device = new AndroidRobot(name);
		const features = device.getSystemFeatures();
		if (features.includes("android.software.leanback") || features.includes("android.hardware.type.television")) {
			return "tv";
		}

		return "mobile";
	}

	private getDeviceVersion(deviceId: string): string {
		try {
			const output = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.build.version.release"], {
				timeout: 5000,
			}).toString().trim();
			return output;
		} catch (error) {
			return "unknown";
		}
	}

	private getDeviceName(deviceId: string): string {
		try {
			// Try getting AVD name first (for emulators)
			const avdName = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.boot.qemu.avd_name"], {
				timeout: 5000,
			}).toString().trim();

			if (avdName !== "") {
				// Replace underscores with spaces (e.g., "Pixel_9_Pro" -> "Pixel 9 Pro")
				return avdName.replace(/_/g, " ");
			}

			// Fall back to product model
			const output = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.product.model"], {
				timeout: 5000,
			}).toString().trim();
			return output;
		} catch (error) {
			return deviceId;
		}
	}

	public getConnectedDevices(): AndroidDevice[] {
		try {
			const names = execFileSync(getAdbPath(), ["devices"])
				.toString()
				.split("\n")
				.map(line => line.trim())
				.filter(line => line !== "")
				.filter(line => !line.startsWith("List of devices attached"))
				.map(line => line.split("\t")[0]);

			return names.map(name => ({
				deviceId: name,
				deviceType: this.getDeviceType(name),
			}));
		} catch (error) {
			console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
			return [];
		}
	}

	public getConnectedDevicesWithDetails(): Array<AndroidDevice & { version: string, name: string }> {
		try {
			const names = execFileSync(getAdbPath(), ["devices"])
				.toString()
				.split("\n")
				.map(line => line.trim())
				.filter(line => line !== "")
				.filter(line => !line.startsWith("List of devices attached"))
				.map(line => line.split("\t")[0]);

			return names.map(deviceId => ({
				deviceId,
				deviceType: this.getDeviceType(deviceId),
				version: this.getDeviceVersion(deviceId),
				name: this.getDeviceName(deviceId),
			}));
		} catch (error) {
			console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
			return [];
		}
	}
}

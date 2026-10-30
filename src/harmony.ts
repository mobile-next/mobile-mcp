import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenElementRect, ScreenSize, SwipeDirection, Orientation } from "./robot";
import { validatePackageName } from "./utils";

export interface HarmonyDevice {
	deviceId: string;
	deviceType: "tv" | "mobile";
}

// uitest dumpLayout emits a JSON tree where every node carries string-typed attributes
interface HarmonyLayoutNode {
	attributes?: {
		type?: string;
		text?: string;
		id?: string;
		bounds?: string;
		hint?: string;
		key?: string;
		focused?: string;
		selected?: string;
		checked?: string;
		checkable?: string;
		clickable?: string;
		enabled?: string;
	};
	children?: HarmonyLayoutNode[];
}

const getHdcPath = (): string => {
	if (process.env.HDC_HOME) {
		return process.env.HDC_HOME;
	}

	if (process.env.HARMONY_HOME) {
		return path.join(process.env.HARMONY_HOME, "toolchains", "hdc");
	}

	if (process.env.DEVECO_SDK_HOME) {
		// DevEco Studio layout: <sdk>/default/openharmony/toolchains/hdc
		const candidate = path.join(process.env.DEVECO_SDK_HOME, "default", "openharmony", "toolchains", "hdc");
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	if (process.platform === "darwin" && process.env.HOME) {
		const candidates = [
			// DevEco Studio default install locations
			path.join("/Applications", "DevEco-Studio.app", "Contents", "sdk", "default", "openharmony", "toolchains", "hdc"),
			path.join(process.env.HOME, "Library", "Huawei", "Sdk", "openharmony", "toolchains", "hdc"),
			path.join(process.env.HOME, "Library", "OpenHarmony", "sdk", "default", "openharmony", "toolchains", "hdc"),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	// fallthrough, hope for the best
	return "hdc";
};

const BUTTON_MAP: Record<Button, string> = {
	"BACK": "Back",
	"HOME": "Home",
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
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;

// hdc file recv prints its own transfer status to stdout and exits 0 even when the
// remote file is missing, so the local temp file's existence is the only success signal
const recvFile = (deviceId: string, remotePath: string): Buffer => {
	const tmpFile = path.join(os.tmpdir(), `mobile-mcp-hdc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	try {
		execFileSync(getHdcPath(), ["-t", deviceId, "file", "recv", remotePath, tmpFile], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
			stdio: ["pipe", "pipe", "pipe"],
		});
		if (!existsSync(tmpFile)) {
			throw new ActionableError(`hdc file recv failed for ${remotePath} - file does not exist on device`);
		}
		return fs.readFileSync(tmpFile);
	} finally {
		try {
			fs.rmSync(tmpFile, { force: true });
		} catch {
			// cleanup is best effort
		}
	}
};

/**
 * HarmonyOS / OpenHarmony device automation over hdc + uitest.
 *
 * Known limitations (all verified on a real HarmonyOS 7.0 device, Pura X):
 * - setOrientation: not supported - harmony exposes no shell-level rotation
 *   control equivalent to android's user_rotation setting; throws ActionableError.
 * - getOrientation: derived from render resolution (width > height), which is
 *   accurate for the default display but is a snapshot, not a live sensor read.
 * - longPress: uiInput longClick takes no duration parameter, so duration is
 *   approximated with a swipe-in-place whose velocity encodes the duration.
 * - getLogs / screen recording / fold / location / clipboard / crashes: not
 *   implemented (optional Robot methods; the tools degrade the same way they do
 *   for other robots that skip them).
 * - screen scale is assumed to be 3.0x (typical harmony phones); there is no
 *   reliable density query over hdc today.
 * - lockscreen with a password: automation can wake, swipe and open the pin pad,
 *   but cannot (and should not) bypass the password. Test devices should disable
 *   lockscreen passwords.
 * - launchApp resolves the main ability via bm dump; apps that hide their
 *   module json may need to be launched by bundle name from the home screen.
 */
export class HarmonyRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	public hdc(...args: string[]): Buffer {
		return execFileSync(getHdcPath(), ["-t", this.deviceId, "shell", ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	public silentHdc(...args: string[]): Buffer {
		return execFileSync(getHdcPath(), ["-t", this.deviceId, "shell", ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
			stdio: ["pipe", "pipe", "pipe"],
		});
	}

	// true when the screen is on; a suspended screen makes every uitest injection
	// silently fail and aa start refuse to launch, so interaction paths call this first
	private isScreenOn(): boolean {
		try {
			const output = this.silentHdc("hidumper", "-s", "RenderService", "-a", "screen").toString();
			return output.includes("POWER_STATUS_ON");
		} catch (error) {
			// can't tell - assume on and let the interaction surface any real error
			return true;
		}
	}

	private ensureScreenAwake(): void {
		if (this.isScreenOn()) {
			return;
		}

		try {
			this.silentHdc("power-shell", "wakeup");
			// give the display a moment before the caller's actual command
			this.silentHdc("shell", "sleep", "1");
		} catch (error) {
			// wake failed; the caller's own command will report the visible symptom
		}
	}

	public async getScreenSize(): Promise<ScreenSize> {
		// render resolution=1320x2120 on the active screen line
		const output = this.hdc("hidumper", "-s", "RenderService", "-a", "screen").toString();
		const match = output.match(/render resolution=(\d+)x(\d+)/);
		if (!match) {
			throw new ActionableError("Failed to get screen size from hidumper RenderService");
		}

		const [, width, height] = match.map(Number);
		// scale: harmony uses vp units at 160dpi base, same formula as android's density scale.
		// we don't have a reliable density source via hdc, so default to 3x (most harmony phones)
		return { width, height, scale: 3.0 };
	}

	public async listApps(): Promise<InstalledApp[]> {
		// bm dump -a lists bundle names; preinstalled system bundles are prefixed with spaces, user-installable sections differ.
		// keep it simple: return all bundle names, deduped and sorted
		const output = this.hdc("bm", "dump", "-a").toString();
		const bundleNames = output
			.split("\n")
			.map(line => line.trim())
			.filter(line => /^[a-zA-Z][a-zA-Z0-9_.]+$/.test(line))
			.filter((value, index, self) => self.indexOf(value) === index);

		return bundleNames.map(packageName => ({
			packageName,
			appName: packageName,
		}));
	}

	public async launchApp(packageName: string): Promise<void> {
		validatePackageName(packageName);

		this.ensureScreenAwake();

		// aa start requires both bundle and ability on harmony. Resolve the app's
		// main ability from bm dump rather than hardcoding "EntryAbility" - huawei
		// system apps use names like "MainAbility" or module-scoped abilities.
		const abilityName = this.getMainAbilityName(packageName);
		if (!abilityName) {
			throw new ActionableError(`Failed launching app "${packageName}": could not resolve its main ability name`);
		}

		try {
			this.silentHdc("aa", "start", "-b", packageName, "-a", abilityName);
		} catch (error) {
			throw new ActionableError(`Failed launching app with bundle name "${packageName}", please make sure it exists`);
		}
	}

	private getMainAbilityName(packageName: string): string | null {
		try {
			const output = this.hdc("bm", "dump", "-n", packageName).toString();
			// parse "mainElement" from the module/ability json dump; entries look like:
			// "mainElement": "EntryAbility",
			const mainElement = output.match(/"mainElement"\s*:\s*"([^"]+)"/);
			if (mainElement) {
				return mainElement[1];
			}

			// fallback: first ability whose name suggests entry
			const abilityNames = [...output.matchAll(/"name"\s*:\s*"((?:\w+Ability))"/g)].map(m => m[1]);
			const preferred = abilityNames.find(name => /main|entry|index/i.test(name));
			return preferred || abilityNames[0] || null;
		} catch (error) {
			return null;
		}
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

		// uitest uiInput swipe takes velocity (200-40000), not duration
		this.hdc("uitest", "uiInput", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "600");
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const screenSize = await this.getScreenSize();

		let x0: number, y0: number, x1: number, y1: number;

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

		this.hdc("uitest", "uiInput", "swipe", `${Math.round(x0)}`, `${Math.round(y0)}`, `${Math.round(x1)}`, `${Math.round(y1)}`, "600");
	}

	public async getScreenshot(): Promise<Buffer> {
		// screenCap writes png on device; pull it back then clean up
		const remotePath = `/data/local/tmp/mobile-mcp-screencap-${Date.now()}.png`;
		this.hdc("uitest", "screenCap", "-p", remotePath);
		try {
			return recvFile(this.deviceId, remotePath);
		} finally {
			try {
				this.silentHdc("rm", "-f", remotePath);
			} catch {
				// cleanup is best effort
			}
		}
	}

	private collectElements(node: HarmonyLayoutNode): ScreenElement[] {
		const elements: Array<ScreenElement> = [];

		if (!node.attributes) {
			return elements;
		}

		const attrs = node.attributes;

		for (const child of node.children || []) {
			elements.push(...this.collectElements(child));
		}

		const bounds = attrs.bounds || "";
		const rect = this.parseBounds(bounds);
		if (!rect || (rect.width <= 0 && rect.height <= 0)) {
			return elements;
		}

		const hasContent = attrs.text || attrs.hint || attrs.id || attrs.checkable === "true";
		if (!hasContent) {
			return elements;
		}

		const element: ScreenElement = {
			type: attrs.type || "text",
			text: attrs.text,
			label: attrs.hint || "",
			rect,
		};

		if (attrs.id) {
			element.identifier = attrs.id;
		}

		if (attrs.focused === "true") {
			// only provide it when true, same as the android robot
			element.focused = true;
		}

		if (attrs.checked === "true") {
			element.checked = true;
		}

		if (attrs.selected === "true") {
			element.selected = true;
		}

		elements.push(element);
		return elements;
	}

	private parseBounds(bounds: string): ScreenElementRect | null {
		const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
		if (!match) {
			return null;
		}

		const [, left, top, right, bottom] = match.map(Number);
		return {
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const remotePath = "/data/local/tmp/mobile-mcp-layout.json";
		this.silentHdc("rm", "-f", remotePath);
		this.hdc("uitest", "dumpLayout", "-p", remotePath);
		const json = recvFile(this.deviceId, remotePath);

		try {
			this.silentHdc("rm", "-f", remotePath);
		} catch {
			// cleanup is best effort
		}

		let tree: HarmonyLayoutNode;
		try {
			tree = JSON.parse(json.toString("utf8"));
		} catch (error) {
			throw new ActionableError("Failed to parse uitest dumpLayout JSON - the screen is most likely off or locked");
		}

		return this.collectElements(tree);
	}

	public async terminateApp(packageName: string): Promise<void> {
		validatePackageName(packageName);
		// aa force-stop works on harmony api 12+; fall back silently if unsupported
		try {
			this.silentHdc("aa", "force-stop", packageName);
		} catch (error) {
			// already terminated or unsupported, same no-op contract as android
		}
	}

	public async installApp(path: string): Promise<void> {
		try {
			execFileSync(getHdcPath(), ["-t", this.deviceId, "install", "-r", path], {
				maxBuffer: MAX_BUFFER_SIZE,
				timeout: 300000, // installs can take a while
			});
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			execFileSync(getHdcPath(), ["-t", this.deviceId, "uninstall", bundleId], {
				maxBuffer: MAX_BUFFER_SIZE,
				timeout: TIMEOUT,
			});
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async openUrl(url: string): Promise<void> {
		// harmony opens urls through the ability manager's want; start with default browser ability
		this.hdc("aa", "start", "-a", "MainAbility", "-b", "com.huawei.hmos.browser", "-U", url);
	}

	public async sendKeys(text: string): Promise<void> {
		if (text === "") {
			// bail early on empty text, same as android
			return;
		}

		this.ensureScreenAwake();

		// uitest uiInput text inputs at the currently focused location.
		// shell-escape single quotes so the text survives the hdc shell hop.
		const escaped = text.replace(/'/g, "'\\''");
		this.hdc("uitest", "uiInput", "text", `'${escaped}'`);
	}

	public async pressButton(button: Button) {
		const mapped = BUTTON_MAP[button];
		if (!mapped) {
			throw new ActionableError(`Button "${button}" is not supported`);
		}

		this.hdc("uitest", "uiInput", "keyEvent", mapped);
	}

	public async tap(x: number, y: number): Promise<void> {
		this.ensureScreenAwake();
		this.hdc("uitest", "uiInput", "click", `${x}`, `${y}`);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		// uiInput longClick has no duration parameter; a swipe in place approximates it
		this.hdc("uitest", "uiInput", "swipe", `${x}`, `${y}`, `${x}`, `${y}`, `${Math.min(40000, Math.max(200, duration))}`);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		this.hdc("uitest", "uiInput", "doubleClick", `${x}`, `${y}`);
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		// harmony: orientation control via aa bake is not exposed; using the shell set
		// of uitest is not available either. graceful no-op with an actionable error.
		throw new ActionableError("setOrientation is not supported on HarmonyOS devices yet");
	}

	public async getOrientation(): Promise<Orientation> {
		const screenSize = await this.getScreenSize();
		return screenSize.width > screenSize.height ? "landscape" : "portrait";
	}
}

export class HarmonyDeviceManager {

	private getDeviceVersion(deviceId: string): string {
		try {
			return execFileSync(getHdcPath(), ["-t", deviceId, "shell", "param", "get", "const.product.software.version"], {
				timeout: 5000,
			}).toString().trim();
		} catch (error) {
			return "unknown";
		}
	}

	private getDeviceName(deviceId: string): string {
		// try device params in order of descriptiveness; each read can fail with a
		// "Get parameter ... fail!" message on stdout, which we must not return as a name
		const params = ["const.product.name", "const.product.model"];
		for (const param of params) {
			try {
				const value = execFileSync(getHdcPath(), ["-t", deviceId, "shell", "param", "get", param], {
					timeout: 5000,
				}).toString().trim();

				if (value && !value.includes("fail") && !value.includes("error")) {
					return value;
				}
			} catch (error) {
				// try next param
			}
		}

		return deviceId;
	}

	public getConnectedDevices(): HarmonyDevice[] {
		return this.getConnectedDevicesWithDetails().map(device => ({
			deviceId: device.deviceId,
			deviceType: device.deviceType,
		}));
	}

	public getConnectedDevicesWithDetails(): Array<HarmonyDevice & { version: string, name: string }> {
		try {
			const output = execFileSync(getHdcPath(), ["list", "targets"], {
				maxBuffer: MAX_BUFFER_SIZE,
				timeout: 10000,
			}).toString();

			return output
				.split("\n")
				.map(line => line.trim())
				.filter(line => line !== "" && !line.startsWith("[Empty]") && line !== "[Empty]")
				.filter(line => /^[a-zA-Z0-9.:_\-]+$/.test(line))
				.map(deviceId => {
					let deviceType: "tv" | "mobile" = "mobile";
					try {
						const deviceTypeOutput = execFileSync(getHdcPath(), ["-t", deviceId, "shell", "param", "get", "const.product.device_type"], {
							timeout: 5000,
						}).toString().trim();
						// device_type 3 is tv in openharmony, default everything else to mobile
						if (deviceTypeOutput === "3" || deviceTypeOutput.toLowerCase() === "tv") {
							deviceType = "tv";
						}
					} catch (error) {
						// keep mobile
					}

					return {
						deviceId,
						deviceType,
						version: this.getDeviceVersion(deviceId),
						name: this.getDeviceName(deviceId),
					};
				});
		} catch (error) {
			// hdc not installed or no daemon - silent, same as the android manager's behavior shape
			return [];
		}
	}
}

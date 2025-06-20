import { execFileSync } from "child_process";

import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection, Orientation } from "./robot";

export interface Simulator {
	name: string;
	uuid: string;
	state: string;
}

interface ListDevicesResponse {
	devices: {
		[key: string]: Array<{
			state: string;
			name: string;
			isAvailable: boolean;
			udid: string;
		}>,
	},
}

interface AppInfo {
	ApplicationType: string;
	Bundle: string;
	CFBundleDisplayName: string;
	CFBundleExecutable: string;
	CFBundleIdentifier: string;
	CFBundleName: string;
	CFBundleVersion: string;
	DataContainer: string;
	Path: string;
}

const TIMEOUT = 30000;
const WDA_PORT = 8100;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

export class Simctl implements Robot {

	constructor(private readonly simulatorUuid: string) {}

	private async wda(): Promise<WebDriverAgent> {
		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		return wda;
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync("xcrun", ["simctl", ...args], {
			timeout: TIMEOUT,
			maxBuffer: MAX_BUFFER_SIZE,
		});
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		const wda = await this.wda();
		await wda.openUrl(url);
		// alternative: this.simctl("openurl", this.simulatorUuid, url);
	}

	public async launchApp(packageName: string) {
		this.simctl("launch", this.simulatorUuid, packageName);
	}

	public async terminateApp(packageName: string) {
		this.simctl("terminate", this.simulatorUuid, packageName);
	}

	public async listApps(): Promise<InstalledApp[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const result = execFileSync("plutil", ["-convert", "json", "-o", "-", "-r", "-"], {
			input: text,
		});

		const output = JSON.parse(result.toString()) as Record<string, AppInfo>;
		return Object.values(output).map(app => ({
			packageName: app.CFBundleIdentifier,
			appName: app.CFBundleDisplayName,
		}));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const wda = await this.wda();
		return wda.getScreenSize();
	}

	public async sendKeys(keys: string) {
		const wda = await this.wda();
		return wda.sendKeys(keys);
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
		const wda = await this.wda();
		return wda.tap(x, y);
	}

	public async pressButton(button: Button) {
		const wda = await this.wda();
		return wda.pressButton(button);
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

	public async getDeviceLogs(options?: { timeWindow?: string; filter?: string; process?: string }): Promise<string> {
		const timeWindow = options?.timeWindow || "1m";
		const filter = options?.filter;
		const processFilter = options?.process;
		const deviceUuid = this.simulatorUuid;

		let predicate = "";
		let currentApp: string | null = null;

		// If a specific process is provided, use that
		if (processFilter) {
			currentApp = processFilter;
			predicate = `subsystem == "${processFilter}"`;
		} else {
			// Try to detect currently running user apps from installed apps
			try {
				const runningApps = await this.listApps();

				// Filter to non-Apple user apps
				const userApps = runningApps
					.map((app: InstalledApp) => app.packageName)
					.filter((appId: string) => !appId.startsWith("com.apple.") && appId.includes("."));

				if (userApps.length > 0) {
					// For now, just use the first user app found
					// In the future, we could try to detect which is actually running
					currentApp = userApps[0];
					predicate = `subsystem == "${currentApp}"`;
				}
			} catch (error) {
				// Failed to get apps, continue with fallback
			}

			// If no user app detected, use broader filter for non-Apple apps
			if (!predicate) {
				predicate = "subsystem CONTAINS \"com.\" AND NOT subsystem BEGINSWITH \"com.apple.\"";
			}
		}
		if (filter) {
			predicate += ` AND composedMessage CONTAINS[c] "${filter}"`;
		}

		const args = [
			"spawn", deviceUuid, "log", "show",
			"--last", timeWindow,
			"--predicate", predicate,
			"--info",
			"--debug"
		];

		try {
			const logs = this.simctl(...args).toString();
			const appInfo = currentApp ? ` (focused on: ${currentApp})` : " (all non-Apple apps)";
			const debugInfo = `DEBUG: Using predicate: ${predicate}${appInfo}\n\n`;
			return `${debugInfo}${logs}`;
		} catch (error) {
			if (error instanceof Error && error.message.includes("No logging subsystem")) {
				return "No logs found for the current running applications.";
			}
			throw error;
		}
	}
}

export class SimctlManager {

	public listSimulators(): Simulator[] {
		// detect if this is a mac
		if (process.platform !== "darwin") {
			// don't even try to run xcrun
			return [];
		}

		try {
			const text = execFileSync("xcrun", ["simctl", "list", "devices", "-j"]).toString();
			const json: ListDevicesResponse = JSON.parse(text);
			return Object.values(json.devices).flatMap(device => {
				return device.map(d => {
					return {
						name: d.name,
						uuid: d.udid,
						state: d.state,
					};
				});
			});
		} catch (error) {
			console.error("Error listing simulators", error);
			return [];
		}
	}

	public listBootedSimulators(): Simulator[] {
		return this.listSimulators()
			.filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}

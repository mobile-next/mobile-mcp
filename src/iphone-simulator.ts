import { execFileSync } from "child_process";

import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection, Orientation, NetworkInfo } from "./robot";

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
		}>;
	};
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
			throw new ActionableError(
				"WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/",
			);
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
		const wda = await this.wda();
		return await wda.getScreenshot();
		// alternative: return this.simctl("io", this.simulatorUuid, "screenshot", "-");
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

	public async getNetworkInfo(): Promise<NetworkInfo> {
		try {
			const hasInternet = this.checkInternetViaPing();

			// Simulators use the host's network, so it's typically WiFi
			return {
				type: hasInternet ? "wifi" : "none",
				isConnected: hasInternet,
				networkName: this.getSimulatorNetworkName(hasInternet),
			};
		} catch (error) {
			// Fallback in case of unexpected errors
			return {
				type: "none",
				isConnected: false,
				networkName: "Simulator (Error)",
			};
		}
	}

	private checkInternetViaPing(): boolean {
		try {
			// iOS simulators use the host's network, so check host connectivity
			// instead of trying to ping from within the simulator
			execFileSync("ping", ["-c", "1", "-W", "3000", "8.8.8.8"], {
				timeout: 5000,
				stdio: "ignore"
			});
			return true;
		} catch {
			return false;
		}
	}

	private getSimulatorNetworkName(hasInternet: boolean): string {
		return hasInternet ? "Simulator Network (Host)" : "Simulator (No Internet)";
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
		return this.listSimulators().filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}

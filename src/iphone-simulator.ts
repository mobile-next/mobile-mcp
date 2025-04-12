import { execFileSync } from "child_process";

import { WebDriverAgent } from "./webdriver-agent";
import { Button, InstalledApp, Robot, ScreenSize, SwipeDirection } from "./robot";

export interface Simulator {
	name: string;
	uuid: string;
	state: string;
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
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

export class Simctl implements Robot {

	private readonly wda: WebDriverAgent;

	constructor(private readonly simulatorUuid: string) {
		this.wda = new WebDriverAgent("localhost", 8100);
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync(
			"xcrun",
			["simctl", ...args],
			{
				timeout: TIMEOUT,
				maxBuffer: MAX_BUFFER_SIZE,
			}
		);
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		await this.wda.openUrl(url);
		// alternative: this.simctl("openurl", this.simulatorUuid, url);
	}

	public async launchApp(packageName: string) {
		this.simctl("launch", this.simulatorUuid, packageName);
	}

	public async terminateApp(packageName: string) {
		this.simctl("terminate", this.simulatorUuid, packageName);
	}

	private parseIOSAppData(inputText: string): Array<AppInfo> {
		const result: Array<AppInfo> = [];

		// Remove leading and trailing characters if needed
		const cleanText = inputText.trim();

		// Extract each app section
		const appRegex = /"([^"]+)"\s+=\s+\{([^}]+)\};/g;
		let appMatch;

		while ((appMatch = appRegex.exec(cleanText)) !== null) {
			// const bundleId = appMatch[1];
			const appContent = appMatch[2];

			const appInfo: Partial<AppInfo> = {
			};

			// parse simple key-value pairs
			const keyValueRegex = /\s+(\w+)\s+=\s+([^;]+);/g;
			let keyValueMatch;

			while ((keyValueMatch = keyValueRegex.exec(appContent)) !== null) {
				const key = keyValueMatch[1];
				let value = keyValueMatch[2].trim();

				// Handle quoted string values
				if (value.startsWith('"') && value.endsWith('"')) {
					value = value.substring(1, value.length - 1);
				}

				if (key !== "GroupContainers" && key !== "SBAppTags") {
					(appInfo as any)[key] = value;
				}
			}

			result.push(appInfo as AppInfo);
		}

		return result;
	}

	public async listApps(): Promise<InstalledApp[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const apps = this.parseIOSAppData(text);
		return apps.map(app => ({
			packageName: app.CFBundleIdentifier,
			appName: app.CFBundleDisplayName,
		}));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		return this.wda.getScreenSize();
	}

	public async sendKeys(keys: string) {
		return this.wda.sendKeys(keys);
	}

	public async swipe(direction: SwipeDirection) {
		return this.wda.swipe(direction);
	}

	public async tap(x: number, y: number) {
		return this.wda.tap(x, y);
	}

	public async pressButton(button: Button) {
		await this.wda.pressButton(button);
	}

	public async getElementsOnScreen(): Promise<any[]> {
		return await this.wda.getElementsOnScreen();
	}
}

export class SimctlManager {

	private parseSimulator(line: string): Simulator | null {
		// extract device name and UUID from the line
		const match = line.match(/(.*?)\s+\(([\w-]+)\)\s+\((\w+)\)/);
		if (!match) {
			return null;
		}

		const deviceName = match[1].trim();
		const deviceUuid = match[2];
		const deviceState = match[3];

		return {
			name: deviceName,
			uuid: deviceUuid,
			state: deviceState,
		};
	}

	public listSimulators(): Simulator[] {
		return execSync(`xcrun simctl list devices`)
			.toString()
			.split("\n")
			.map(line => this.parseSimulator(line))
			.filter(simulator => simulator !== null);
	}

	public listBootedSimulators(): Simulator[] {
		return this.listSimulators()
			.filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}

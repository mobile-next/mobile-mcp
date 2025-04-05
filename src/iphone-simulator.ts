import { execFileSync, execSync } from "child_process";
import { Button, Dimensions, Robot, SwipeDirection } from "./robot";
import { WebDriverAgent } from "./webdriver-agent";

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
	GroupContainers: Record<string, string>;
	Path: string;
	SBAppTags: string[];
}


export class Simctl implements Robot {

	private readonly webDriverAgent: WebDriverAgent;

	constructor(private readonly simulatorUuid: string) {
		this.webDriverAgent = new WebDriverAgent("localhost", 8100);
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync(
			"xcrun",
			["simctl", ...args],
			{ maxBuffer: 1024 * 1024 * 4 }
		);
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		this.simctl("openurl", this.simulatorUuid, url);
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
				GroupContainers: {},
				SBAppTags: []
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

			// parse GroupContainers
			const groupContainersMatch = appContent.match(/GroupContainers\s+=\s+\{([^}]+)\};/);
			if (groupContainersMatch) {
				const groupContainersContent = groupContainersMatch[1];
				const groupRegex = /"([^"]+)"\s+=\s+"([^"]+)"/g;
				let groupMatch;

				while ((groupMatch = groupRegex.exec(groupContainersContent)) !== null) {
					const groupId = groupMatch[1];
					const groupPath = groupMatch[2];
					appInfo.GroupContainers![groupId] = groupPath;
				}
			}

			// parse SBAppTags
			const sbAppTagsMatch = appContent.match(/SBAppTags\s+=\s+\(\s*(.*?)\s*\);/);
			if (sbAppTagsMatch) {
				const tagsContent = sbAppTagsMatch[1].trim();
				if (tagsContent) {
					const tagRegex = /"([^"]+)"/g;
					let tagMatch;

					while ((tagMatch = tagRegex.exec(tagsContent)) !== null) {
						appInfo.SBAppTags!.push(tagMatch[1]);
					}
				}
			}

			result.push(appInfo as AppInfo);
		}

		return result;
	}

	public async listApps(): Promise<string[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const apps = this.parseIOSAppData(text);
		return apps.map(app => app.CFBundleIdentifier);
	}

	public async getScreenSize(): Promise<Dimensions> {
		return this.webDriverAgent.getScreenSize();
	}

	public async sendKeys(keys: string) {
		return this.webDriverAgent.sendKeys(keys);
	}

	public async swipe(direction: SwipeDirection) {
		await this.webDriverAgent.withinSession(async sessionUrl => {

			const x0 = 200;
			let y0 = 600;
			const x1 = 200;
			let y1 = 200;

			if (direction === "up") {
				const tmp = y0;
				y0 = y1;
				y1 = tmp;
			}

			const url = `${sessionUrl}/actions`;
			await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					actions: [
						{
							type: "pointer",
							id: "finger1",
							parameters: { pointerType: "touch" },
							actions: [
								{ type: "pointerMove", duration: 0, x: x0, y: y0 },
								{ type: "pointerDown", button: 0 },
								{ type: "pointerMove", duration: 0, x: x1, y: y1 },
								{ type: "pause", duration: 1000 },
								{ type: "pointerUp", button: 0 }
							]
						}
					]
				}),
			});
		});
	}

	public async tap(x: number, y: number) {
		await this.webDriverAgent.tap(x, y);
	}

	public async pressButton(button: Button) {
		await this.webDriverAgent.pressButton(button);
	}

	public async getElementsOnScreen(): Promise<any[]> {
		return await this.webDriverAgent.getElementsOnScreen();
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

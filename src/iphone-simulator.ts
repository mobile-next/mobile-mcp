import { execFileSync, execSync } from "child_process";
import { Button, Dimensions, Robot, SwipeDirection } from "./robot";

export interface Simulator {
	name: string;
	uuid: string;
}

interface SourceTreeElement {
	type: string;
	label?: string;
	name?: string;
	rawIdentifier?: string;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};

	children?: Array<SourceTreeElement>;
}

interface SourceTree {
	value: SourceTreeElement;
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
	constructor(private readonly simulatorUuid: string) {
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync(
			"xcrun",
			["simctl", ...args],
			{ maxBuffer: 1024 * 1024 * 4 });
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
			const bundleId = appMatch[1];
			const appContent = appMatch[2];

			const appInfo: Partial<AppInfo> = {
				GroupContainers: {},
				SBAppTags: []
			};

			// Parse simple key-value pairs
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

			// Parse GroupContainers
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

			// Parse SBAppTags
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

	// Example usage
	// const inputText = `your iOS app data here`;
	// const parsedData = parseIOSAppData(inputText);
	// console.log(JSON.stringify(parsedData, null, 2));

	public async listApps(): Promise<string[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const apps = this.parseIOSAppData(text);
		return apps.map(app => app.CFBundleIdentifier);
	}

	public async getScreenSize(): Promise<Dimensions> {
		return this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/window/size`;
			const response = await fetch(url);
			const json = await response.json();
			return {
				width: json.value.width,
				height: json.value.height
			};
		});
	}

	public async sendKeys(keys: string) {
		await this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/wda/keys`;
			await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ value: [keys] }),
			});
		});
	}

	public async swipe(direction: SwipeDirection) {
		await this.withinSession(async (port, sessionId) => {

			let x0 = 200;
			let y0 = 600;
			let x1 = 200;
			let y1 = 200;

			if (direction === "up") {
				const tmp = y0;
				y0 = y1;
				y1 = tmp;
			}

			const url = `http://localhost:${port}/session/${sessionId}/actions`;
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
		await this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/actions`;
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
								{ type: "pointerMove", duration: 0, x, y },
								{ type: "pointerDown", button: 0 },
								{ type: "pause", duration: 100 },
								{ type: "pointerUp", button: 0 }
							]
						}
					]
				}),
			});
		});
	}

	public async pressButton(button: Button) {
		const _map = {
			"HOME": "home",
			"VOLUME_UP": "volumeup",
			"VOLUME_DOWN": "volumedown",
		};

		if (button === "ENTER") {
			await this.sendKeys("\n");
			return;
		}

		// Type assertion to check if button is a key of _map
		if (!(button in _map)) {
			throw new Error(`Button "${button}" is not supported`);
		}

		await this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/wda/pressButton`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: button,
				}),
			});

			return response.json();
		});
	}

	private async createSession(port: number) {
		const url = `http://localhost:${port}/session`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
		});

		const json = await response.json();
		return json.value.sessionId;
	}

	private async deleteSession(port: number, sessionId: string) {
		const url = `http://localhost:${port}/session/${sessionId}`;
		const response = await fetch(url, { method: "DELETE" });
		return response.json();
	}

	private async withinSession(fn: (port: number, sessionId: string) => Promise<any>) {
		const port = 8100;
		const sessionId = await this.createSession(port);
		const result = await fn(port, sessionId);
		await this.deleteSession(port, sessionId);
		return result;
	}

	private filterSourceElements(source: SourceTreeElement): Array<any> {

		const output: any[] = [];

		console.error("gilm " + JSON.stringify(source));
		if (source.type === "TextField" || source.type === "Button" || source.type === "Switch") {
			output.push({
				type: source.type,
				label: source.label,
				name: source.name,
				rect: {
					x0: source.rect.x,
					y0: source.rect.y,
					x1: source.rect.x + source.rect.width,
					y1: source.rect.y + source.rect.height,
				},
			});
		}

		if (source.children) {
			for (const child of source.children) {
				output.push(...this.filterSourceElements(child));
			}
		}

		return output;
	}

	public async getPageSource(): Promise<SourceTree> {
		const port = 8100;
		const url = `http://localhost:${port}/source/?format=json`;
		const response = await fetch(url);
		const json = await response.json();
		return json as SourceTree;
	}

	public async getElementsOnScreen(): Promise<any[]> {
		const source = await this.getPageSource();
		return this.filterSourceElements(source.value);
	}
}

export class SimctlManager {

	public listBootedSimulators(): Simulator[] {
		return execSync(`xcrun simctl list devices`)
			.toString()
			.split("\n")
			.map(line => {
				// extract device name and UUID from the line
				const match = line.match(/(.*?)\s+\(([\w-]+)\)\s+\(Booted\)/);
				if (!match) {
					return null;
				}

				const deviceName = match[1].trim();
				const deviceUuid = match[2];
				return {
					name: deviceName,
					uuid: deviceUuid,
				};
			})
			.filter(line => line !== null);
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}


import { execFileSync, execSync } from "child_process";
import { Dimensions, Robot, SwipeDirection } from "./robot";

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

export class Simctl implements Robot {
	constructor(private readonly simulatorUuid: string) {
	}

	private async simctl(command: string, ...args: string[]): Promise<Buffer> {
		return execFileSync(
			"xcrun",
			["simctl", command, this.simulatorUuid, ...args],
			{ maxBuffer: 1024 * 1024 * 4 });
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		return this.simctl("openurl", this.simulatorUuid, url);
	}

	public async launchApp(packageName: string) {
		return this.simctl("launch", this.simulatorUuid, packageName);
	}

	public async terminateApp(packageName: string) {
		return this.simctl("terminate", this.simulatorUuid, packageName);
	}

	public async listApps() {
		return this.simctl("listapps", this.simulatorUuid);
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

	public getElementsOnScreen(): any[] {
		return [];
	}

	public async sendKeys(keys: string) {
		await this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/wda/keys`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ value: [keys] }),
			});
		});
	};
	
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
			const response = await fetch(url, {
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
	
			return response.json();
		});
	};
	
	private async tap(x: number, y: number) {
		await this.withinSession(async (port, sessionId) => {
			const url = `http://localhost:${port}/session/${sessionId}/actions`;
			const response = await fetch(url, {
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
	
			return response.json();
		});
	};

	private async createSession = async (port: number) {
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
	};
	
	private async deleteSession = async (port: number, sessionId: string) {
		const url = `http://localhost:${port}/session/${sessionId}`;
		const response = await fetch(url, { method: "DELETE" });
		return response.json();
	};
	
	private async withinSession(fn: (port: number,sessionId: string) => Promise<any>)  {
		const port = 8100;
		const sessionId = await this.createSession(port);
		const result = await fn(port, sessionId);
		await this.deleteSession(port, sessionId);
		return result;
	};
}

export class SimctlManager {

	public getConnectedDevices(): Simulator[] {
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


export const filterSourceElements = (source: SourceTreeElement): Array<any> => {

	const output: any[] = [];

	if (source.type === "TextField") {
		output.push({
			type: "TextField",
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
			output.push(...filterSourceElements(child));
		}
	}

	return output;
};

export const getPageSource = async (port: number): Promise<SourceTree> => {
	const url = `http://localhost:${port}/source/?format=json`;
	const response = await fetch(url);
	const json = await response.json();
	return json as SourceTree;
};

export const pressHomeButton = async (port: number) => {
	await withinSession(port, async sessionId => {
		const url = `http://localhost:${port}/session/${sessionId}/wda/pressButton`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "home",
			}),
		});

		return response.json();
	});
};


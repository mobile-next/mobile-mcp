import { SwipeDirection } from "./robot";

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

export class WebDriverAgent {

	constructor(private readonly host: string, private readonly port: number) {
	}

	public async createSession() {
		const url = `http://${this.host}:${this.port}/session`;
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

	public async deleteSession(sessionId: string) {
		const url = `http://${this.host}:${this.port}/session/${sessionId}`;
		const response = await fetch(url, { method: "DELETE" });
		return response.json();
	}

	public async withinSession(fn: (url: string) => Promise<any>) {
		const sessionId = await this.createSession();
		const url = `http://${this.host}:${this.port}/session/${sessionId}`;
		const result = await fn(url);
		await this.deleteSession(sessionId);
		return result;
	}

	public async getScreenSize() {
		return this.withinSession(async sessionUrl => {
			const url = `${sessionUrl}/wda/screen`;
			const response = await fetch(url);
			const json = await response.json();
			return {
				width: json.value.screenSize.width * json.value.scale,
				height: json.value.screenSize.height * json.value.scale,
			};
		});
	}

	public async sendKeys(keys: string) {
		await this.withinSession(async sessionUrl => {
			const url = `${sessionUrl}/wda/keys`;
			await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ value: [keys] }),
			});
		});
	}

	public async pressButton(button: string) {
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

		await this.withinSession(async sessionUrl => {
			const url = `${sessionUrl}/wda/pressButton`;
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

	public async tap(x: number, y: number) {
		await this.withinSession(async sessionUrl => {
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

	private filterSourceElements(source: SourceTreeElement): Array<any> {

		const output: any[] = [];

		if (["TextField", "Button", "Switch"].includes(source.type)) {
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
		const url = `http://${this.host}:${this.port}/source/?format=json`;
		const response = await fetch(url);
		const json = await response.json();
		return json as SourceTree;
	}

	public async getElementsOnScreen(): Promise<any[]> {
		const source = await this.getPageSource();
		return this.filterSourceElements(source.value);
	}

	public async openUrl(url: string): Promise<void> {
		await this.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/url`, {
				method: "POST",
				body: JSON.stringify({ url }),
			});
		});
	}

	public async swipe(direction: SwipeDirection) {
		await this.withinSession(async sessionUrl => {

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
}

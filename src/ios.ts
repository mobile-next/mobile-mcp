
import { readFileSync, unlinkSync } from "fs";
import { Button, Dimensions, Robot, SwipeDirection } from "./robot";
import { execFileSync, execSync } from "child_process";
import { WebDriverAgent } from "./webdriver-agent";

export class IosRobot implements Robot {

	private readonly wda: WebDriverAgent;

	public constructor(private deviceId: string) {
		this.wda = new WebDriverAgent("localhost", 8100);
	}

	private async ios(...args: string[]): Promise<string> {
		return execFileSync("ios", ["--udid", this.deviceId, ...args], {}).toString();
	}

	public async getScreenSize(): Promise<Dimensions> {
		return await this.wda.getScreenSize();
	}

	public swipe(direction: SwipeDirection): Promise<void> {
		return Promise.resolve();
	}

	public async listApps(): Promise<string[]> {
		const output = await this.ios("apps", "--all", "--list");
		return output
			.split("\n")
			.map(line => line.split(" ")[0]);
	}

	public async launchApp(packageName: string): Promise<void> {
		await this.ios("launch", packageName);
	}

	public async terminateApp(packageName: string): Promise<void> {
		await this.ios("kill", packageName);
	}

	public async openUrl(url: string): Promise<void> {
		await this.wda.withinSession(async sessionUrl => {
			await fetch(`${sessionUrl}/url`, {
				method: "POST",
				body: JSON.stringify({ url }),
			});
		});
	}

	public async sendKeys(text: string): Promise<void> {
		await this.wda.sendKeys(text);
	}

	public async pressButton(button: Button): Promise<void> {
		await this.wda.pressButton(button);
	}

	public async tap(x: number, y: number): Promise<void> {
		await this.wda.tap(x, y);
	}

	public async getElementsOnScreen(): Promise<any[]> {
		return await this.wda.getElementsOnScreen();
	}

	public async getScreenshot(): Promise<Buffer> {
		await this.ios("screenshot", "--output", "screenshot.png");
		const buffer = readFileSync("screenshot.png");
		unlinkSync("screenshot.png");
		return buffer;
	}
}

export class IosManager {
	public async listDevices(): Promise<string[]> {
		const output = execSync("ios list").toString();
		const json = JSON.parse(output) as any;
		return json.deviceList;
	}
}

async function main() {
	const ios = new IosRobot("4C07ED7E-AE81-412E-8AA9-1061EED59DFA");
	const before = +new Date();
	console.dir(await ios.getElementsOnScreen(), { depth: null });
	const after = +new Date();
	console.log(`Time taken: ${after - before}ms`);
	// await ios.pressButton("VOLUME_UP");
}
main().then();

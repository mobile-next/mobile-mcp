import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { readFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { Socket } from "net";

import { ScreenElement, WebDriverAgent } from "./webdriver-agent";
import { Button, Dimensions, InstalledApp, Robot, SwipeDirection } from "./robot";

const WDA_PORT = 8100;
const IOS_TUNNEL_PORT = 60105;

interface ListCommandOutput {
	deviceList: string[];
}

const getGoIosPath = (): string => {
	return "ios";
};

export class IosRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	private isListeningOnPort(port: number): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const client = new Socket();
			client.connect(port, "localhost", () => {
				client.destroy();
				resolve(true);
			});

			client.on("error", (err: any) => {
				resolve(false);
			});
		});
	}

	private async isTunnelRunning(): Promise<boolean> {
		return await this.isListeningOnPort(IOS_TUNNEL_PORT);
	}

	private async isWdaForwardRunning(): Promise<boolean> {
		return await this.isListeningOnPort(WDA_PORT);
	}

	private async wda(): Promise<WebDriverAgent> {
		if (!(await this.isTunnelRunning())) {
			throw new Error("iOS tunnel is not running, please see https://github.com/mobile-next/mobile-mcp/wiki/Getting-Started-with-iOS");
		}

		if (!(await this.isWdaForwardRunning())) {
			throw new Error("Port forwarding to WebDriverAgent is not running, please see https://github.com/mobile-next/mobile-mcp/wiki/Getting-Started-with-iOS");
		}

		const wda = new WebDriverAgent("localhost", WDA_PORT);
		return wda;
	}

	private async ios(...args: string[]): Promise<string> {
		return execFileSync(getGoIosPath(), ["--udid", this.deviceId, ...args], {}).toString();
	}

	public async getScreenSize(): Promise<Dimensions> {
		const wda = await this.wda();
		return await wda.getScreenSize();
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const wda = await this.wda();
		await wda.swipe(direction);
	}

	public async listApps(): Promise<InstalledApp[]> {
		const output = await this.ios("apps", "--all", "--list");
		return output
			.split("\n")
			.map(line => {
				const [packageName, appName] = line.split(" ");
				return {
					packageName,
					appName,
				};
			});
	}

	public async launchApp(packageName: string): Promise<void> {
		await this.ios("launch", packageName);
	}

	public async terminateApp(packageName: string): Promise<void> {
		await this.ios("kill", packageName);
	}

	public async openUrl(url: string): Promise<void> {
		const wda = await this.wda();
		await wda.openUrl(url);
	}

	public async sendKeys(text: string): Promise<void> {
		const wda = await this.wda();
		await wda.sendKeys(text);
	}

	public async pressButton(button: Button): Promise<void> {
		const wda = await this.wda();
		await wda.pressButton(button);
	}

	public async tap(x: number, y: number): Promise<void> {
		const wda = await this.wda();
		await wda.tap(x, y);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return await wda.getElementsOnScreen();
	}

	public async getScreenshot(): Promise<Buffer> {
		const tmpFilename = join(tmpdir(), `screenshot-${randomBytes(8).toString("hex")}.png`);
		await this.ios("screenshot", "--output", tmpFilename);
		const buffer = readFileSync(tmpFilename);
		unlinkSync(tmpFilename);
		return buffer;
	}
}

export class IosManager {
	public async listDevices(): Promise<string[]> {
		const output = execFileSync(getGoIosPath(), ["list"]).toString();
		const json: ListCommandOutput = JSON.parse(output);
		return json.deviceList;
	}
}

import { Socket } from "node:net";
import { execFileSync } from "node:child_process";

import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenSize, SwipeDirection, ScreenElement, Orientation } from "./robot";
import { validatePackageName, validateLocale } from "./utils";

const WDA_PORT = 8100;
const IOS_TUNNEL_PORT = 60105;

interface ListCommandOutput {
	deviceList: string[];
}

interface VersionCommandOutput {
	version: string;
}

interface InfoCommandOutput {
	DeviceClass: string;
	DeviceName: string;
	ProductName: string;
	ProductType: string;
	ProductVersion: string;
	PhoneNumber: string;
	TimeZone: string;
}

interface CoreDeviceListOutput {
	result?: {
		devices?: CoreDeviceEntry[];
	};
}

interface CoreDeviceDetailsOutput {
	result?: {
		connectionProperties?: {
			transportType?: string;
		};
		deviceProperties?: {
			name?: string;
			osVersionNumber?: string;
		};
		hardwareProperties?: {
			productType?: string;
			udid?: string;
		};
	};
}

interface CoreDeviceAppsOutput {
	result?: {
		apps?: Array<{
			bundleIdentifier?: string;
			name?: string;
			version?: string;
		}>;
	};
}

interface CoreDeviceEntry {
	connectionProperties?: {
		pairingState?: string;
		transportType?: string;
		tunnelState?: string;
	};
	deviceProperties?: {
		bootState?: string;
		name?: string;
		osVersionNumber?: string;
	};
	hardwareProperties?: {
		productType?: string;
		reality?: string;
		udid?: string;
	};
}

export interface IosDevice {
	deviceId: string;
	deviceName: string;
}

export type IosPlatform = "ios" | "tvos";
export type IosDeviceWithDetails = IosDevice & { version: string; platform: IosPlatform };

/**
 * Real Apple TV units are enumerated over the same go-ios connection as iPhones and
 * iPads, so they are distinguished by their product type (e.g. "AppleTV14,1") rather
 * than a separate device class.
 */
export const platformFromProductType = (productType: string): IosPlatform =>
	productType.startsWith("AppleTV") ? "tvos" : "ios";

export const coreDeviceDevicesFromJson = (output: string): IosDeviceWithDetails[] => {
	const json = JSON.parse(output) as CoreDeviceListOutput;
	const entries = json.result?.devices ?? [];

	return entries
		.filter(entry => entry.hardwareProperties?.reality === "physical")
		.filter(entry => entry.connectionProperties?.pairingState === "paired")
		.filter(entry => {
			const bootState = entry.deviceProperties?.bootState ?? "";
			const tunnelState = entry.connectionProperties?.tunnelState ?? "";
			const transportType = entry.connectionProperties?.transportType ?? "";
			return bootState === "booted" || tunnelState === "connected" || transportType === "usb" || transportType === "localNetwork";
		})
		.map(entry => {
			const deviceId = entry.hardwareProperties?.udid?.trim() ?? "";
			const deviceName = entry.deviceProperties?.name?.trim() ?? "";
			const version = entry.deviceProperties?.osVersionNumber?.trim() ?? "";
			const productType = entry.hardwareProperties?.productType?.trim() ?? "";
			return {
				deviceId,
				deviceName,
				version,
				platform: platformFromProductType(productType),
			};
		})
		.filter(device => device.deviceId.length > 0);
};

const getGoIosPath = (): string => {
	if (process.env.GO_IOS_PATH) {
		return process.env.GO_IOS_PATH;
	}

	// fallback to go-ios in PATH via `npm install -g go-ios`
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

	private async assertTunnelRunning(): Promise<void> {
		if (await this.isTunnelRequired()) {
			if (!(await this.isTunnelRunning())) {
				throw new ActionableError("iOS tunnel is not running, please see https://github.com/mobile-next/mobile-mcp/wiki/");
			}
		}
	}

	private async wda(): Promise<WebDriverAgent> {

		await this.assertTunnelRunning();

		if (!(await this.isWdaForwardRunning())) {
			throw new ActionableError("Port forwarding to WebDriverAgent is not running (tunnel okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on device (tunnel okay, port forwarding okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		return wda;
	}

	private async ios(...args: string[]): Promise<string> {
		return execFileSync(getGoIosPath(), ["--udid", this.deviceId, ...args], {}).toString();
	}

	private devicectl(...args: string[]): string {
		return execFileSync("xcrun", ["devicectl", ...args, "--json-output", "-"], {
			stdio: ["pipe", "pipe", "ignore"],
		}).toString();
	}

	private getCoreDeviceInfo(): InfoCommandOutput {
		const output = this.devicectl("device", "info", "details", "--device", this.deviceId);
		const json = JSON.parse(output) as CoreDeviceDetailsOutput;
		return {
			DeviceClass: "iPhone",
			DeviceName: json.result?.deviceProperties?.name ?? this.deviceId,
			ProductName: json.result?.hardwareProperties?.productType ?? "",
			ProductType: json.result?.hardwareProperties?.productType ?? "",
			ProductVersion: json.result?.deviceProperties?.osVersionNumber ?? "",
			PhoneNumber: "",
			TimeZone: "",
		};
	}

	public async getIosVersion(): Promise<string> {
		try {
			const output = await this.ios("info");
			const json = JSON.parse(output);
			return json.ProductVersion;
		} catch {
			return this.getCoreDeviceInfo().ProductVersion;
		}
	}

	private async isTunnelRequired(): Promise<boolean> {
		const version = await this.getIosVersion();
		const args = version.split(".");
		return parseInt(args[0], 10) >= 17;
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const wda = await this.wda();
		return await wda.getScreenSize();
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const wda = await this.wda();
		await wda.swipe(direction);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const wda = await this.wda();
		await wda.swipeFromCoordinate(x, y, direction, distance);
	}

	public async listApps(): Promise<InstalledApp[]> {
		try {
			await this.assertTunnelRunning();

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
		} catch {
			const output = this.devicectl("device", "info", "apps", "--device", this.deviceId);
			const json = JSON.parse(output) as CoreDeviceAppsOutput;
			return (json.result?.apps ?? [])
				.filter(app => (app.bundleIdentifier ?? "").length > 0)
				.map(app => ({
					packageName: app.bundleIdentifier ?? "",
					appName: app.name ?? "",
				}));
		}
	}

	public async launchApp(packageName: string, locale?: string): Promise<void> {
		validatePackageName(packageName);
		try {
			await this.assertTunnelRunning();
			const args = ["launch", packageName];
			if (locale) {
				validateLocale(locale);
				const locales = locale.split(",").map(l => l.trim());
				args.push("-AppleLanguages", `(${locales.join(", ")})`);
				args.push("-AppleLocale", locales[0]);
			}

			await this.ios(...args);
		} catch {
			this.devicectl("device", "process", "launch", "--device", this.deviceId, packageName);
		}
	}

	public async terminateApp(packageName: string): Promise<void> {
		validatePackageName(packageName);
		await this.assertTunnelRunning();
		await this.ios("kill", packageName);
	}

	public async installApp(path: string): Promise<void> {
		await this.assertTunnelRunning();
		try {
			await this.ios("install", "--path", path);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		await this.assertTunnelRunning();
		try {
			await this.ios("uninstall", "--bundleid", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
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

	public async doubleTap(x: number, y: number): Promise<void> {
		const wda = await this.wda();
		await wda.doubleTap(x, y);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		const wda = await this.wda();
		await wda.longPress(x, y, duration);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return await wda.getElementsOnScreen();
	}

	public async getScreenshot(): Promise<Buffer> {
		const wda = await this.wda();
		return await wda.getScreenshot();

		/* alternative:
		await this.assertTunnelRunning();
		const tmpFilename = path.join(tmpdir(), `screenshot-${randomBytes(8).toString("hex")}.png`);
		await this.ios("screenshot", "--output", tmpFilename);
		const buffer = readFileSync(tmpFilename);
		unlinkSync(tmpFilename);
		return buffer;
		*/
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const wda = await this.wda();
		await wda.setOrientation(orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		const wda = await this.wda();
		return await wda.getOrientation();
	}
}

export class IosManager {

	private listCoreDeviceDevicesWithDetails(): IosDeviceWithDetails[] {
		try {
			const output = execFileSync("xcrun", ["devicectl", "list", "devices", "--json-output", "-"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
			return coreDeviceDevicesFromJson(output);
		} catch (error) {
			return [];
		}
	}

	private listGoIosDevicesWithDetails(): IosDeviceWithDetails[] {
		if (!this.isGoIosInstalled()) {
			return [];
		}

		const output = execFileSync(getGoIosPath(), ["list"]).toString();
		const json: ListCommandOutput = JSON.parse(output);
		return json.deviceList.map(device => {
			const info = this.getDeviceInfo(device);
			return {
				deviceId: device,
				deviceName: info.DeviceName,
				version: info.ProductVersion,
				platform: platformFromProductType(info.ProductType),
			};
		});
	}

	private mergeUniqueDevices(devices: IosDeviceWithDetails[]): IosDeviceWithDetails[] {
		const seen = new Set<string>();
		return devices.filter(device => {
			if (seen.has(device.deviceId)) {
				return false;
			}
			seen.add(device.deviceId);
			return true;
		});
	}

	public isGoIosInstalled(): boolean {
		try {
			const output = execFileSync(getGoIosPath(), ["version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
			const json: VersionCommandOutput = JSON.parse(output);
			return json.version !== undefined && (/^v?\d+\.\d+\.\d+/.test(json.version) || json.version === "local-build");
		} catch (error) {
			return false;
		}
	}

	public getDeviceName(deviceId: string): string {
		return this.getDeviceInfo(deviceId).DeviceName;
	}

	public getDeviceInfo(deviceId: string): InfoCommandOutput {
		try {
			const output = execFileSync(getGoIosPath(), ["info", "--udid", deviceId]).toString();
			const json: InfoCommandOutput = JSON.parse(output);
			return json;
		} catch {
			const output = execFileSync("xcrun", ["devicectl", "device", "info", "details", "--device", deviceId, "--json-output", "-"], {
				stdio: ["pipe", "pipe", "ignore"],
			}).toString();
			const json = JSON.parse(output) as CoreDeviceDetailsOutput;
			return {
				DeviceClass: "iPhone",
				DeviceName: json.result?.deviceProperties?.name ?? deviceId,
				ProductName: json.result?.hardwareProperties?.productType ?? "",
				ProductType: json.result?.hardwareProperties?.productType ?? "",
				ProductVersion: json.result?.deviceProperties?.osVersionNumber ?? "",
				PhoneNumber: "",
				TimeZone: "",
			};
		}
	}

	public listDevices(): IosDeviceWithDetails[] {
		return this.listDevicesWithDetails();
	}

	public listDevicesWithDetails(): IosDeviceWithDetails[] {
		const devices = [
			...this.listGoIosDevicesWithDetails(),
			...this.listCoreDeviceDevicesWithDetails(),
		];
		return this.mergeUniqueDevices(devices);
	}
}

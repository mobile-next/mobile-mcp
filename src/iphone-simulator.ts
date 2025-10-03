import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename, extname } from "node:path";

import { trace } from "./logger";
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

	private async isWdaInstalled(): Promise<boolean> {
		const apps = await this.listApps();
		return apps.map(app => app.packageName).includes("com.facebook.WebDriverAgentRunner.xctrunner");
	}

	private async startWda(): Promise<void> {
		if (!(await this.isWdaInstalled())) {
			// wda is not even installed, won't attempt to start it
			return;
		}

		trace("Starting WebDriverAgent");
		const webdriverPackageName = "com.facebook.WebDriverAgentRunner.xctrunner";
		this.simctl("launch", this.simulatorUuid, webdriverPackageName);

		// now we wait for wda to have a successful status
		const wda = new WebDriverAgent("localhost", WDA_PORT);

		// wait up to 10 seconds for wda to start
		const timeout = +new Date() + 10 * 1000;
		while (+new Date() < timeout) {
			// cross fingers and see if wda is already running
			if (await wda.isRunning()) {
				trace("WebDriverAgent is now running");
				return;
			}

			// wait 100ms before trying again
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		trace("Could not start WebDriverAgent in time, giving up");
	}

	private async wda(): Promise<WebDriverAgent> {
		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			await this.startWda();
			if (!(await wda.isRunning())) {
				throw new ActionableError("WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/");
			}

			// was successfully started
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

	private isPathSecure(basePath: string, targetPath: string): boolean {
		const resolvedBase = resolve(basePath);
		const resolvedTarget = resolve(targetPath);
		return resolvedTarget.startsWith(resolvedBase);
	}

	private findAppBundle(dir: string): string | null {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.endsWith(".app")) {
				return join(dir, entry.name);
			}
		}

		return null;
	}

	public async installApp(path: string): Promise<void> {
		let tempDir: string | null = null;
		let installPath = path;

		try {
			// Check if this is a .zip file
			if (extname(path).toLowerCase() === ".zip") {
				trace(`Detected .zip file, extracting to temporary directory`);

				// Create a temporary directory
				tempDir = mkdtempSync(join(tmpdir(), "ios-app-"));

				// Unzip the file with security checks
				try {
					execFileSync("unzip", ["-q", path, "-d", tempDir], {
						timeout: TIMEOUT,
						maxBuffer: MAX_BUFFER_SIZE,
					});
				} catch (error: any) {
					throw new ActionableError(`Failed to unzip file: ${error.message}`);
				}

				// Verify all extracted files are within the temp directory (zipslip protection)
				const verifyExtraction = (dir: string): void => {
					const entries = readdirSync(dir, { withFileTypes: true });

					for (const entry of entries) {
						const fullPath = join(dir, entry.name);

						// Check for zipslip attack
						if (!this.isPathSecure(tempDir!, fullPath)) {
							throw new ActionableError(`Security violation: File path ${entry.name} attempts to escape extraction directory`);
						}

						if (entry.isDirectory()) {
							verifyExtraction(fullPath);
						}
					}
				};

				verifyExtraction(tempDir);

				// Find the .app bundle in the extracted files
				const appBundle = this.findAppBundle(tempDir);

				if (!appBundle) {
					throw new ActionableError("No .app bundle found in the .zip file");
				}

				installPath = appBundle;
				trace(`Found .app bundle at: ${basename(appBundle)}`);
			}

			// Install the app
			this.simctl("install", this.simulatorUuid, installPath);

		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);

		} finally {
			// Clean up temporary directory if it was created
			if (tempDir) {
				try {
					trace(`Cleaning up temporary directory`);
					rmSync(tempDir, { recursive: true, force: true });
				} catch (cleanupError) {
					trace(`Warning: Failed to cleanup temporary directory: ${cleanupError}`);
				}
			}
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			this.simctl("uninstall", this.simulatorUuid, bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
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

	public async longPress(x: number, y: number) {
		const wda = await this.wda();
		return wda.longPress(x, y);
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

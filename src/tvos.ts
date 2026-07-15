import { Mobilecli } from "./mobilecli";
import { ActionableError, Button, InstalledApp, Orientation, Robot, ScreenElement, ScreenSize, SwipeDirection } from "./robot";

interface InstalledAppsResponse {
	status: "ok",
	data: Array<{
		packageName: string;
		appName?: string;
		version?: string;
	}>;
}

interface DeviceInfoResponse {
	status: "ok",
	data: {
		device: {
			id: string;
			name: string;
			platform: string;
			type: string;
			version: string;
			state: string;
			screenSize?: {
				width: number;
				height: number;
				scale: number;
			};
		};
	};
}

interface UIElementResponse {
	type: string;
	label?: string;
	text?: string;
	name?: string;
	value?: string;
	identifier?: string;
	rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	focused?: boolean;
}

interface DumpUIResponse {
	status: "ok",
	data: {
		elements: UIElementResponse[];
	};
}

/**
 * Siri Remote buttons exposed by the tvOS device.io.button handler. These are
 * distinct from the physical/D-pad buttons in the shared `Button` union (which
 * stays untouched for iPhone/Android per decision D2).
 */
export type TvosButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "SELECT" | "MENU" | "PLAY_PAUSE";

const TVOS_BUTTONS: readonly TvosButton[] = ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "MENU", "PLAY_PAUSE"];

const isTvosButton = (button: string): button is TvosButton =>
	(TVOS_BUTTONS as readonly string[]).includes(button);

/**
 * TvosRobot drives a real Apple TV through the mobilecli binary (backed by the
 * DeviceKit runner over the CoreDevice tunnel). Touch and orientation operations
 * do not apply to tvOS and surface explicit `ActionableError`s rather than silent
 * no-ops.
 */
export class TvosRobot implements Robot {

	private mobilecli: Mobilecli;

	public constructor(private deviceId: string) {
		this.mobilecli = new Mobilecli();
	}

	private runCommand(args: string[]): string {
		const fullArgs = [...args, "--device", this.deviceId];
		return this.mobilecli.executeCommand(fullArgs);
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const response = JSON.parse(this.runCommand(["device", "info"])) as DeviceInfoResponse;
		if (response.data.device.screenSize) {
			return response.data.device.screenSize;
		}

		return { width: 0, height: 0, scale: 1.0 };
	}

	public async swipe(_direction: SwipeDirection): Promise<void> {
		throw new ActionableError("swipe is not supported on tvOS");
	}

	public async swipeFromCoordinate(_x: number, _y: number, _direction: SwipeDirection, _distance?: number): Promise<void> {
		throw new ActionableError("swipe is not supported on tvOS");
	}

	public async getScreenshot(): Promise<Buffer> {
		const fullArgs = ["screenshot", "--device", this.deviceId, "--format", "png", "--output", "-"];
		return this.mobilecli.executeCommandBuffer(fullArgs);
	}

	public async listApps(): Promise<InstalledApp[]> {
		const response = JSON.parse(this.runCommand(["apps", "list"])) as InstalledAppsResponse;
		return response.data.map(app => ({
			appName: app.appName || app.packageName,
			packageName: app.packageName,
		})) as InstalledApp[];
	}

	public async launchApp(packageName: string, locale?: string): Promise<void> {
		const args = ["apps", "launch", packageName];
		if (locale) {
			args.push("--locale", locale);
		}

		this.runCommand(args);
	}

	public async terminateApp(packageName: string): Promise<void> {
		this.runCommand(["apps", "terminate", packageName]);
	}

	public async installApp(path: string): Promise<void> {
		this.runCommand(["apps", "install", path]);
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		this.runCommand(["apps", "uninstall", bundleId]);
	}

	public async openUrl(url: string): Promise<void> {
		// Best-effort on tvOS (D5): attempt the open and surface the underlying
		// error as an ActionableError rather than a silent failure.
		try {
			this.runCommand(["url", url]);
		} catch (err: any) {
			throw new ActionableError(`Failed to open URL on tvOS: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	public async sendKeys(_text: string): Promise<void> {
		throw new ActionableError("text entry is not supported on tvOS");
	}

	public async pressButton(button: Button): Promise<void> {
		if (!isTvosButton(button as string)) {
			throw new ActionableError(`Button "${button}" is not supported on tvOS. Supported Siri Remote buttons: ${TVOS_BUTTONS.join(", ")}`);
		}

		this.mobilecli.pressButton(this.deviceId, button);
	}

	public async tap(_x: number, _y: number): Promise<void> {
		throw new ActionableError("tap is not supported on tvOS");
	}

	public async doubleTap(_x: number, _y: number): Promise<void> {
		throw new ActionableError("doubleTap is not supported on tvOS");
	}

	public async longPress(_x: number, _y: number, _duration: number): Promise<void> {
		throw new ActionableError("longPress is not supported on tvOS");
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const response = JSON.parse(this.runCommand(["dump", "ui"])) as DumpUIResponse;
		return response.data.elements.map(element => ({
			type: element.type,
			label: element.label,
			text: element.text,
			name: element.name,
			value: element.value,
			identifier: element.identifier,
			rect: element.rect,
			focused: element.focused,
		}));
	}

	public async setOrientation(_orientation: Orientation): Promise<void> {
		throw new ActionableError("setOrientation is not supported on tvOS");
	}

	public async getOrientation(): Promise<Orientation> {
		throw new ActionableError("getOrientation is not supported on tvOS");
	}

	/**
	 * Focus an on-screen element by accessibility identifier and/or label, driving
	 * Siri Remote focus through the DeviceKit `device.io.focus` RPC exposed by
	 * mobilecli. Returns the focused element as reported by the runner.
	 */
	public async focus(identifier?: string, label?: string): Promise<unknown> {
		if (!identifier && !label) {
			throw new ActionableError("focus requires at least one of identifier or label");
		}

		let response;
		try {
			response = this.mobilecli.focusByIdentifier(this.deviceId, identifier, label);
		} catch (err: any) {
			throw new ActionableError(`Failed to focus element on tvOS: ${err instanceof Error ? err.message : String(err)}`);
		}

		if (response.status !== "ok") {
			throw new ActionableError(response.error ?? "Failed to focus element on tvOS");
		}

		const focusedElement = response.data?.element;
		if (focusedElement === undefined || focusedElement === null) {
			throw new ActionableError("focus returned no element on tvOS");
		}

		return focusedElement;
	}
}

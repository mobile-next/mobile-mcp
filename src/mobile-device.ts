import { Mobilecli, MobilecliDevice } from "./mobilecli";
import { ActionableError, Button, InstalledApp, Orientation, Robot, ScreenElement, ScreenSize, ScreenshotOptions, SwipeDirection } from "./robot";

interface InstalledAppsResponse {
	status: "ok",
	data: Array<{
		packageName: string;
		appName?: string; // ios
		version?: string; // ios
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
	ref?: string;
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
	selected?: boolean;
	checked?: boolean;
	enabled?: boolean;
	children?: UIElementResponse[];
}

interface DumpUIResponse {
	status: "ok",
	data: {
		elements: UIElementResponse[];
	};
}

interface RawIOSUIElementResponse {
	elementType?: number;
	label?: string;
	identifier?: string;
	frame?: {
		X?: number;
		Y?: number;
		Width?: number;
		Height?: number;
	};
	children?: RawIOSUIElementResponse[];
}

interface RawDumpUIResponse {
	status: "ok",
	data: {
		rawData?: RawIOSUIElementResponse;
	};
}

interface ForegroundAppResponse {
	status: "ok",
	data: {
		packageName: string;
		appName?: string;
	};
}

interface OrientationResponse {
	status: "ok",
	data: {
		orientation: Orientation;
	};
}

interface ClipboardResponse {
	data: {
		text: string;
	};
}

const flattenUIElement = (element: UIElementResponse): ScreenElement[] => {
	const screenElement: ScreenElement = {
		type: element.type,
		label: element.label,
		text: element.text,
		name: element.name,
		value: element.value,
		identifier: element.identifier,
		rect: element.rect,
		ref: element.ref,
		focused: element.focused,
		selected: element.selected,
		checked: element.checked,
		enabled: element.enabled,
	};

	if (!element.children) {
		return [screenElement];
	}

	return [screenElement, ...element.children.flatMap(child => flattenUIElement(child))];
};

const normalizedWords = (value: string): string => value
	.trim()
	.toLowerCase()
	.replace(/[:._-]+/g, " ")
	.replace(/\s+/g, " ");

/**
 * Detects compact iOS labels that are missing or mechanically derived from an
 * accessibility identifier instead of carrying user-facing semantics.
 */
const hasIdentifierDerivedLabel = (element: ScreenElement): boolean => {
	if (!element.identifier) {
		return false;
	}

	if (!element.label) {
		return true;
	}

	const identifierTail = element.identifier.includes(":")
		? element.identifier.slice(element.identifier.lastIndexOf(":") + 1)
		: element.identifier;
	const normalizedLabel = normalizedWords(element.label);

	return normalizedLabel === normalizedWords(element.identifier)
		|| normalizedLabel === normalizedWords(identifierTail);
};

/**
 * Builds the same identifier-and-geometry key for raw iOS elements that the
 * compact dump uses after truncating frame coordinates.
 */
const rawElementKey = (element: RawIOSUIElementResponse): string | undefined => {
	if (!element.identifier || !element.frame) {
		return undefined;
	}

	const { X, Y, Width, Height } = element.frame;
	if (
		typeof X !== "number"
		|| typeof Y !== "number"
		|| typeof Width !== "number"
		|| typeof Height !== "number"
	) {
		return undefined;
	}

	return [element.identifier, Math.trunc(X), Math.trunc(Y), Math.trunc(Width), Math.trunc(Height)].join("\u0000");
};

/** Builds an identifier-and-geometry key for one compact screen element. */
const screenElementKey = (element: ScreenElement): string | undefined => {
	if (!element.identifier) {
		return undefined;
	}

	const { x, y, width, height } = element.rect;
	return [element.identifier, x, y, width, height].join("\u0000");
};

/**
 * Indexes unambiguous raw iOS labels. A null value marks a key that appears
 * with conflicting labels and must not be used for recovery.
 */
const collectRawIOSLabels = (root: RawIOSUIElementResponse): Map<string, string | null> => {
	const labels = new Map<string, string | null>();
	const visit = (element: RawIOSUIElementResponse): void => {
		const key = rawElementKey(element);
		if (key && element.label?.trim()) {
			if (!labels.has(key)) {
				labels.set(key, element.label);
			} else if (labels.get(key) !== element.label) {
				labels.set(key, null);
			}
		}
		element.children?.forEach(visit);
	};
	visit(root);
	return labels;
};

/**
 * Restores native iOS accessibility labels where compact output lost them,
 * leaving elements unchanged when the raw match is missing or ambiguous.
 */
const restoreIOSAccessibilityLabels = (
	elements: ScreenElement[],
	rawRoot: RawIOSUIElementResponse,
): ScreenElement[] => {
	const rawLabels = collectRawIOSLabels(rawRoot);
	return elements.map(element => {
		if (!hasIdentifierDerivedLabel(element)) {
			return element;
		}

		const key = screenElementKey(element);
		const rawLabel = key ? rawLabels.get(key) : undefined;
		return rawLabel ? { ...element, label: rawLabel } : element;
	});
};

export class MobileDevice implements Robot {

	private mobilecli: Mobilecli;

	public constructor(private deviceId: string, private platform?: MobilecliDevice["platform"]) {
		this.mobilecli = new Mobilecli();
	}

	private runCommand(args: string[]): string {
		const fullArgs = [...args, "--device", this.deviceId];
		return this.mobilecli.executeCommand(fullArgs);
	}

	private runJsonCommand<T>(args: string[]): T {
		const output = this.runCommand(args);
		try {
			return JSON.parse(output) as T;
		} catch {
			throw new ActionableError(`Failed to parse JSON response from mobilecli ${args.join(" ")}`);
		}
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const response = this.runJsonCommand<DeviceInfoResponse>(["device", "info"]);
		if (response.data.device.screenSize) {
			return response.data.device.screenSize;
		}
		return { width: 0, height: 0, scale: 1.0 };
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = Math.floor(screenSize.width / 2);
		const centerY = Math.floor(screenSize.height / 2);
		const distance = 400; // Default distance in pixels

		let startX = centerX;
		let startY = centerY;
		let endX = centerX;
		let endY = centerY;

		switch (direction) {
			case "up":
				startY = centerY + distance / 2;
				endY = centerY - distance / 2;
				break;
			case "down":
				startY = centerY - distance / 2;
				endY = centerY + distance / 2;
				break;
			case "left":
				startX = centerX + distance / 2;
				endX = centerX - distance / 2;
				break;
			case "right":
				startX = centerX - distance / 2;
				endX = centerX + distance / 2;
				break;
		}

		this.runCommand(["io", "swipe", `${startX},${startY},${endX},${endY}`]);
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		const swipeDistance = distance || 400;
		let endX = x;
		let endY = y;

		switch (direction) {
			case "up":
				endY = y - swipeDistance;
				break;
			case "down":
				endY = y + swipeDistance;
				break;
			case "left":
				endX = x - swipeDistance;
				break;
			case "right":
				endX = x + swipeDistance;
				break;
		}

		this.runCommand(["io", "swipe", `${Math.round(x)},${Math.round(y)},${Math.round(endX)},${Math.round(endY)}`]);
	}

	public async getScreenshot(options?: ScreenshotOptions): Promise<Buffer> {
		const format = options?.format || "png";
		const fullArgs = ["screenshot", "--device", this.deviceId, "--format", format, "--output", "-"];
		if (format === "jpeg" && options?.quality !== undefined) {
			fullArgs.push("--quality", `${options.quality}`);
		}

		if (options?.maxSize !== undefined) {
			fullArgs.push("--max-size", `${options.maxSize}`);
		}

		if (options?.scale !== undefined && options.scale !== 1) {
			fullArgs.push("--scale", `${options.scale}`);
		}

		return this.mobilecli.executeCommandBuffer(fullArgs);
	}

	public async listApps(): Promise<InstalledApp[]> {
		const response = this.runJsonCommand<InstalledAppsResponse>(["apps", "list"]);
		return response.data.map(app => ({
			appName: app.appName || app.packageName,
			packageName: app.packageName,
		})) as InstalledApp[];
	}

	public async getForegroundApp(): Promise<InstalledApp> {
		const response = this.runJsonCommand<ForegroundAppResponse>(["apps", "foreground"]);
		return {
			appName: response.data.appName || response.data.packageName,
			packageName: response.data.packageName,
		};
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
		this.runCommand(["url", url]);
	}

	public async sendKeys(text: string): Promise<void> {
		this.runCommand(["io", "text", text]);
	}

	public async pressButton(button: Button): Promise<void> {
		this.runCommand(["io", "button", button]);
	}

	public async tap(x: number, y: number): Promise<void> {
		// mobilecli rejects fractional coordinates ("x and y must be integers")
		this.runCommand(["io", "tap", `${Math.round(x)},${Math.round(y)}`]);
	}

	public async tapByRef(ref: string): Promise<void> {
		this.runCommand(["io", "tap", ref]);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		// TODO: should move into mobilecli itself as "io doubletap"
		await this.tap(x, y);
		await this.tap(x, y);
	}

	public async longPress(x: number, y: number, duration: number): Promise<void> {
		this.runCommand(["io", "longpress", `${Math.round(x)},${Math.round(y)}`, "--duration", `${duration}`]);
	}

	/**
	 * Lists visible elements and recovers native iOS accessibility labels when
	 * the compact mobilecli dump replaced them with identifier-derived text.
	 */
	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const response = this.runJsonCommand<DumpUIResponse>(["dump", "ui"]);
		const elements = response.data.elements.flatMap(element => flattenUIElement(element));
		if (this.platform !== "ios" || !elements.some(hasIdentifierDerivedLabel)) {
			return elements;
		}

		try {
			const rawResponse = this.runJsonCommand<RawDumpUIResponse>(["dump", "ui", "--format", "raw"]);
			const rawRoot = rawResponse.data.rawData;
			return rawRoot ? restoreIOSAccessibilityLabels(elements, rawRoot) : elements;
		} catch {
			// Raw label recovery is best-effort; the processed dump remains usable.
			return elements;
		}
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		this.runCommand(["device", "orientation", "set", orientation]);
	}

	public async getOrientation(): Promise<Orientation> {
		const response = this.runJsonCommand<OrientationResponse>(["device", "orientation", "get"]);
		return response.data.orientation;
	}

	public async setLocation(latitude: number, longitude: number): Promise<void> {
		this.runCommand(["device", "location", "set", `${latitude},${longitude}`]);
	}

	public async clearLocation(): Promise<void> {
		this.runCommand(["device", "location", "clear"]);
	}

	public async getClipboard(): Promise<string> {
		const response = this.runJsonCommand<ClipboardResponse>(["io", "clipboard", "get"]);
		return response.data.text;
	}

	public async setClipboard(text: string): Promise<void> {
		this.runCommand(["io", "clipboard", "set", text]);
	}

	public getLogs(limit: number, filters: string[], timeoutMs: number): Promise<string> {
		const args = ["device", "logs", "--limit", String(limit), ...filters.flatMap(filter => ["--filter", filter]), "--device", this.deviceId];
		const child = this.mobilecli.spawnCommand(args, true);

		return new Promise((resolve, reject) => {
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			let silenceTimer: NodeJS.Timeout;

			// kill the stream once no log entry arrived for timeoutMs, then return what was captured
			const restartSilenceTimer = () => {
				clearTimeout(silenceTimer);
				silenceTimer = setTimeout(() => child.kill(), timeoutMs);
			};

			child.stdout?.on("data", (chunk: Buffer) => {
				stdout.push(chunk);
				restartSilenceTimer();
			});

			child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

			child.on("error", err => {
				clearTimeout(silenceTimer);
				reject(err);
			});

			child.on("close", code => {
				clearTimeout(silenceTimer);
				if (code !== 0 && !child.killed) {
					reject(new Error(`mobilecli device logs failed with code ${code}: ${Buffer.concat(stderr).toString().trim()}`));
					return;
				}

				resolve(Buffer.concat(stdout).toString().trim());
			});

			restartSilenceTimer();
		});
	}
}

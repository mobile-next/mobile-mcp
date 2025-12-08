import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { execFileSync } from "node:child_process";

export interface MobilecliDevicesOptions {
	includeOffline?: boolean;
	platform?: "ios" | "android";
	type?: "real" | "emulator" | "simulator";
}

export interface MobilecliDevicesResponse {
	status: "ok";
	data: {
		devices: Array<{
			id: string;
			name: string;
			platform: "android" | "ios";
			type: "real" | "emulator" | "simulator";
			version: string;
		}>;
	};
}

export class Mobilecli {
	private path: string;

	constructor() {
		this.path = Mobilecli.getMobilecliPath();
	}

	protected executeCommand(args: string[]): string {
		return execFileSync(this.path, args, { encoding: "utf8" }).toString().trim();
	}

	public static getMobilecliPath(): string {
		if (process.env.MOBILECLI_PATH) {
			return process.env.MOBILECLI_PATH;
		}

		const platform = process.platform;
		const arch = process.arch;

		const normalizedPlatform = platform === "win32" ? "windows" : platform;
		const normalizedArch = arch === "arm64" ? "arm64" : "amd64";
		const ext = platform === "win32" ? ".exe" : "";
		const binaryName = `mobilecli-${normalizedPlatform}-${normalizedArch}${ext}`;

		// Check if mobile-mcp is installed as a package
		const currentPath = __filename;
		const pathParts = currentPath.split(sep);
		const lastNodeModulesIndex = pathParts.lastIndexOf("node_modules");

		if (lastNodeModulesIndex !== -1) {
			// We're inside node_modules, go to the last node_modules in the path
			const nodeModulesParts = pathParts.slice(0, lastNodeModulesIndex + 1);
			const lastNodeModulesPath = nodeModulesParts.join(sep);
			const mobilecliPath = join(lastNodeModulesPath, "@mobilenext", "mobilecli", "bin", binaryName);

			if (existsSync(mobilecliPath)) {
				return mobilecliPath;
			}
		}

		// Not in node_modules, look one directory up from current script
		const scriptDir = dirname(__filename);
		const parentDir = dirname(scriptDir);
		const mobilecliPath = join(parentDir, "node_modules", "@mobilenext", "mobilecli", "bin", binaryName);

		if (existsSync(mobilecliPath)) {
			return mobilecliPath;
		}

		throw new Error(`Could not find mobilecli binary for platform: ${platform}`);
	}

	getVersion(): string {
		try {
			const output = this.executeCommand(["--version"]);
			if (output.startsWith("mobilecli version ")) {
				return output.substring("mobilecli version ".length);
			}

			return "failed";
		} catch (error: any) {
			return "failed " + error.message;
		}
	}

	getDevices(options?: MobilecliDevicesOptions): MobilecliDevicesResponse {
		const args = ["devices"];

		if (options) {
			if (options.includeOffline) {
				args.push("--include-offline");
			}

			if (options.platform) {
				if (options.platform !== "ios" && options.platform !== "android") {
					throw new Error(`Invalid platform: ${options.platform}. Must be "ios" or "android"`);
				}

				args.push("--platform", options.platform);
			}

			if (options.type) {
				if (options.type !== "real" && options.type !== "emulator" && options.type !== "simulator") {
					throw new Error(`Invalid type: ${options.type}. Must be "real", "emulator", or "simulator"`);
				}

				args.push("--type", options.type);
			}
		}

		const mobilecliOutput = this.executeCommand(args);
		return JSON.parse(mobilecliOutput) as MobilecliDevicesResponse;
	}
}

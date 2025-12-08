import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { execFileSync } from "node:child_process";

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
			const output = execFileSync(this.path, ["--version"], { encoding: "utf8" }).toString().trim();
			if (output.startsWith("mobilecli version ")) {
				return output.substring("mobilecli version ".length);
			}

			return "failed";
		} catch (error: any) {
			return "failed " + error.message;
		}
	}

	getDevices(): MobilecliDevicesResponse {
		const mobilecliOutput = execFileSync(this.path, ["devices"], { encoding: "utf8" }).toString().trim();
		return JSON.parse(mobilecliOutput) as MobilecliDevicesResponse;
	}
}

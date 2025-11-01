import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";

export const getMobilecliPath = (): string => {
	if (process.env.MOBILECLI_PATH) {
		return process.env.MOBILECLI_PATH;
	}

	const arch = process.arch;
	const platform = process.platform;
	let binaryName = "mobilecli";

	switch (platform) {
		case "darwin":
			if (arch === "arm64") {
				binaryName += "-darwin-arm64";
			} else {
				binaryName += "-darwin-amd64";
			}
			break;

		case "linux":
			if (arch === "arm64") {
				binaryName += "-linux-arm64";
			} else {
				binaryName += "-linux-amd64";
			}
			break;

		case "win32":
			binaryName += "-windows-amd64.exe";
			break;

		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

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
};

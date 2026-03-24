import path from "node:path";
import os from "node:os";
import { ActionableError } from "./robot";

export function validatePackageName(packageName: string): void {
	if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}

export function validateLocale(locale: string): void {
	if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
		throw new ActionableError(`Invalid locale: "${locale}"`);
	}
}

function getAllowedRoots(): string[] {
	const roots = [
		os.tmpdir(),
		process.cwd(),
	];

	if (process.platform === "darwin") {
		roots.push("/tmp");
		roots.push("/private/tmp");
	}

	if (process.platform === "win32") {
		roots.push("C:\\Temp");
		roots.push("C:\\Tmp");
	}

	return roots.map(r => path.resolve(r));
}

function isPathUnderRoot(filePath: string, root: string): boolean {
	const relative = path.relative(root, filePath);
	if (relative === "") {
		return false;
	}

	if (path.isAbsolute(relative)) {
		return false;
	}

	if (relative.startsWith("..")) {
		return false;
	}

	return true;
}

export function validateOutputPath(filePath: string): void {
	const resolved = path.resolve(filePath);
	const allowedRoots = getAllowedRoots();
	const isWindows = process.platform === "win32";

	const isAllowed = allowedRoots.some(root => {
		if (isWindows) {
			return isPathUnderRoot(resolved.toLowerCase(), root.toLowerCase());
		}

		return isPathUnderRoot(resolved, root);
	});

	if (!isAllowed) {
		const dir = path.dirname(resolved);
		throw new ActionableError(
			`"${dir}" is not in the list of allowed directories. Allowed directories include the current directory and the temp directory on this host.`
		);
	}
}

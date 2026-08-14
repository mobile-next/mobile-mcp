import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ActionableError } from "./robot";

export function validatePackageName(packageName: string): void {
	// iOS bundle identifiers (which flow through this same "packageName" parameter
	// for launch/terminate) are allowed to contain hyphens per Apple's CFBundleIdentifier
	// format, e.g. "com.some-company.app".
	if (!/^[a-zA-Z0-9._-]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}

export function validateLocale(locale: string): void {
	if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
		throw new ActionableError(`Invalid locale: "${locale}"`);
	}
}

export function validateLaunchArgs(launchArgs: Record<string, string>): void {
	for (const [key, value] of Object.entries(launchArgs)) {
		// keys map to iOS launch argument flags and Android extra keys, so keep them
		// to a conservative identifier-like charset.
		if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
			throw new ActionableError(`Invalid launch argument key: "${key}"`);
		}

		// Node child processes reject NUL in argv. Platform-specific command
		// boundaries are responsible for preserving all other string content.
		if (value.includes("\0")) {
			throw new ActionableError(`Invalid launch argument value for "${key}": "${value}"`);
		}
	}
}

function resolveRoot(root: string): string {
	const resolved = path.resolve(root);

	try {
		return fs.realpathSync(resolved);
	} catch {
		return resolved;
	}
}

function getAllowedRoots(): string[] {
	const roots = [
		os.tmpdir(),
		process.cwd(),
	];

	// macOS /tmp is a symlink to /private/tmp, add both to be safe
	if (process.platform === "darwin") {
		roots.push("/tmp");
		roots.push("/private/tmp");
	}

	// Resolve symlinks so roots line up with resolveWithSymlinks() below. On macOS,
	// os.tmpdir() itself lives under /var/folders/..., and /var is a symlink to
	// /private/var, so without this the real temp directory never matches here.
	return roots.map(resolveRoot);
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

export function validateFileExtension(filePath: string, allowedExtensions: string[], toolName: string): void {
	const ext = path.extname(filePath).toLowerCase();
	if (!allowedExtensions.includes(ext)) {
		throw new ActionableError(`${toolName} requires a ${allowedExtensions.join(", ")} file extension, got: "${ext || "(none)"}"`);
	}
}

function resolveWithSymlinks(filePath: string): string {
	const resolved = path.resolve(filePath);
	const dir = path.dirname(resolved);
	const filename = path.basename(resolved);

	try {
		return path.join(fs.realpathSync(dir), filename);
	} catch {
		return resolved;
	}
}

export function validateOutputPath(filePath: string): void {
	const resolved = resolveWithSymlinks(filePath);
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

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ActionableError } from "./robot";

export function validatePackageName(packageName: string): void {
	// iOS bundle identifiers (which flow through this same "packageName" parameter
	// for launch/terminate) are allowed to contain hyphens per Apple's CFBundleIdentifier
	// format, e.g. "com.some-company.app". the first character must not be "-" so the
	// name is never read as a command-line flag (e.g. "-r") by adb or mobilecli.
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}

export function validateLocale(locale: string): void {
	if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
		throw new ActionableError(`Invalid locale: "${locale}"`);
	}
}

// a url scheme per RFC 3986 section 3.1: a letter, then letters, digits, "+", "-" or "."
const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// url schemes are case-insensitive, but android matches an intent's scheme
// case-sensitively, so HTTPS://example.com would find no browser
export function withLowercaseScheme(url: string): string {
	return url.replace(URL_SCHEME, scheme => scheme.toLowerCase());
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

function findAllowedRoot(resolved: string): string | undefined {
	const isWindows = process.platform === "win32";

	return getAllowedRoots().find(root => {
		if (isWindows) {
			return isPathUnderRoot(resolved.toLowerCase(), root.toLowerCase());
		}

		return isPathUnderRoot(resolved, root);
	});
}

function assertAllowedRoot(resolved: string): string {
	const root = findAllowedRoot(resolved);
	if (!root) {
		const dir = path.dirname(resolved);
		throw new ActionableError(
			`"${dir}" is not in the list of allowed directories. Allowed directories include the current directory and the temp directory on this host.`
		);
	}

	return root;
}

export function validateOutputPath(filePath: string): void {
	assertAllowedRoot(resolveWithSymlinks(filePath));
}

// dotfiles and dot-directories hold secrets (.env, .ssh, .aws) and things that run
// code (.git/hooks, .husky, .envrc, .vscode/tasks.json), so file transfer never touches them
function assertNoHiddenComponent(resolved: string, root: string): void {
	const components = path.relative(root, resolved).split(path.sep);
	if (components.some(component => component.startsWith("."))) {
		throw new ActionableError(`"${resolved}" is a hidden file or inside a hidden directory, which file transfer does not allow`);
	}
}

const SECRET_FILE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".keystore", ".jks", ".mobileprovision"];

// the source of a push is read and sent to the device, which may be a remote cloud
// device, so it is fully resolved (symlinked leaf included) before being checked
export function validatePushSource(filePath: string): string {
	let resolved: string;
	try {
		resolved = fs.realpathSync(path.resolve(filePath));
	} catch {
		throw new ActionableError(`Local file "${filePath}" does not exist`);
	}

	const root = assertAllowedRoot(resolved);
	assertNoHiddenComponent(resolved, root);

	if (SECRET_FILE_EXTENSIONS.includes(path.extname(resolved).toLowerCase())) {
		throw new ActionableError(`"${resolved}" looks like a key or certificate, which file transfer does not allow`);
	}

	if (!fs.statSync(resolved).isFile()) {
		throw new ActionableError(`"${resolved}" is not a regular file`);
	}

	return resolved;
}

// a pull never overwrites: an existing target could be a symlink pointing outside the
// allowed roots, or a file like package.json whose replacement runs code later.
// ponytail: check-then-write race remains in shared /tmp, mobilecli would need O_EXCL to close it
export function validatePullDestination(filePath: string): void {
	const resolved = resolveWithSymlinks(filePath);
	const root = assertAllowedRoot(resolved);
	assertNoHiddenComponent(resolved, root);

	let exists = true;
	try {
		fs.lstatSync(resolved);
	} catch {
		exists = false;
	}

	if (exists) {
		throw new ActionableError(`"${resolved}" already exists, pull to a new file name`);
	}
}

// joins a path the agent gave relative to an app's container onto that container,
// refusing "../" escapes. symlinks inside the container are checked by mobilecli on the device side.
export function joinContainerPath(container: string, relativePath: string): string {
	const base = path.posix.normalize(container).replace(/\/+$/, "");
	const joined = path.posix.join(base, relativePath).replace(/\/+$/, "");
	if (joined !== base && !joined.startsWith(base + "/")) {
		throw new ActionableError(`"${relativePath}" is outside the app's container`);
	}

	return joined;
}

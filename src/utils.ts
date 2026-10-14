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

// windows follows up to 63 reparse points per path, linux 40 and macos 32;
// anything longer is rejected rather than handed to the write
const MAX_SYMLINK_HOPS = 64;

// Walk `filePath` to the real location a write would land on, following a
// symlink in EVERY component - not just the parent directory. Resolving only the
// parent let a symlink at, or before, the final component redirect the write
// while the check still saw an in-root path: a single final-component link was
// covered, but a chain whose intermediate link sits inside an allowed root and
// whose final target is dangling (the file a write would create) was not, so the
// write escaped. Follow each hop to its target until a component that either
// exists as a real file or does not exist at all, and hand that to the root check.
function resolveWithSymlinks(filePath: string): string {
	let current = path.resolve(filePath);

	// bound the walk so a symlink cycle cannot spin forever
	for (let hops = 0; hops < MAX_SYMLINK_HOPS; hops++) {
		const dir = path.dirname(current);
		const filename = path.basename(current);

		// resolve the containing directory first (it may be a symlink itself,
		// e.g. /tmp and /var on macOS) so it lines up with the allowed roots
		let realDir: string;
		try {
			realDir = fs.realpathSync(dir);
		} catch {
			realDir = dir;
		}

		const candidate = path.join(realDir, filename);

		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(candidate);
		} catch {
			// nothing there yet, it will be created at `candidate`
			return candidate;
		}

		if (!stat.isSymbolicLink()) {
			return candidate;
		}

		// follow the link to its target - which may itself be a link, or may not
		// exist yet (exactly where a write would create the file) - and resolve again
		current = path.resolve(realDir, fs.readlinkSync(candidate));
	}

	throw new ActionableError(`"${filePath}" has too many levels of symbolic links.`);
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

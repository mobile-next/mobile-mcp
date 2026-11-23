import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { ActionableError, LaunchAppOptions } from "./robot";

export function validatePackageName(packageName: string): void {
	// iOS bundle identifiers (which flow through this same "packageName" parameter
	// for launch/terminate) are allowed to contain hyphens per Apple's CFBundleIdentifier
	// format, e.g. "com.some-company.app".
	if (!/^[a-zA-Z0-9._-]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}

// the legacy robots don't pass anything to the app process, only mobilecli does
export function rejectLaunchArgumentsAndEnvironment(options: LaunchAppOptions): void {
	const hasArguments = (options.arguments ?? []).length > 0;
	const hasEnvironment = Object.keys(options.environment ?? {}).length > 0;
	if (hasArguments || hasEnvironment) {
		throw new ActionableError("Launch arguments and environment are not supported with MOBILEMCP_LEGACY_ROBOT=1");
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

// the filesystem root, the home directory, or anything above it would make
// almost every file the user owns writable, so it is never an implicit root
function isTooBroadToAllow(dir: string): boolean {
	const resolvedDir = resolveRoot(dir);
	const home = resolveRoot(os.homedir());
	return resolvedDir === home || isPathUnderRoot(home, resolvedDir);
}

function getAllowedRoots(): string[] {
	const roots = [os.tmpdir()];

	if (!isTooBroadToAllow(process.cwd())) {
		roots.push(process.cwd());
	}


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

	if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
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
const WINDOWS_DRIVE_RELATIVE = /^[A-Za-z]:(?![\\/])/;

function splitPathSegments(relativePath: string): string[] {
	const separator = path.sep === "\\" ? /[\\/]+/ : "/";
	return relativePath.split(separator).filter(Boolean);
}

function decomposePath(rawPath: string, fallbackBase: string): { root: string; segments: string[] } {
	if (process.platform === "win32" && WINDOWS_DRIVE_RELATIVE.test(rawPath)) {
		// resolve only the drive's current working directory, keeping raw `..` segments intact
		const driveBase = path.resolve(rawPath.slice(0, 2));
		const { root } = path.parse(driveBase);
		return {
			root,
			segments: [...splitPathSegments(driveBase.slice(root.length)), ...splitPathSegments(rawPath.slice(2))],
		};
	}

	if (path.isAbsolute(rawPath)) {
		const { root } = path.parse(rawPath);
		const resolvedRoot = (process.platform === "win32" && (root === "\\" || root === "/"))
			? path.parse(fallbackBase).root
			: root;
		return {
			root: resolvedRoot,
			segments: splitPathSegments(rawPath.slice(root.length)),
		};
	}

	const { root } = path.parse(fallbackBase);
	return {
		root,
		segments: [...splitPathSegments(fallbackBase.slice(root.length)), ...splitPathSegments(rawPath)],
	};
}

function resolveWithSymlinks(filePath: string): string {
	const initial = decomposePath(filePath, process.cwd());
	let current = initial.root;
	const pending = [...initial.segments];
	let hops = 0;

	// walk each raw path component in OS order so every symlink ancestor is
	// resolved before any following `..` segment is applied
	while (pending.length > 0) {
		const segment = pending.shift()!;
		if (segment === ".") {
			continue;
		}

		if (segment === "..") {
			current = path.dirname(current);
			continue;
		}

		const next = path.join(current, segment);
		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(next);
		} catch (error: any) {
			if (error?.code === "ENOENT" && pending.includes("..")) {
				// keep walking when a later `..` could ascend back into an existing directory
				current = next;
				continue;
			}

			if (error?.code === "ENOENT" || error?.code === "ENOTDIR" || error?.code === "EACCES") {
				// nothing exists from this segment onward, so normalize the
				// remaining segments on top of the resolved prefix
				return path.resolve(next, ...pending);
			}

			throw error;
		}

		if (!stat.isSymbolicLink()) {
			current = next;
			continue;
		}

		hops++;
		if (hops > MAX_SYMLINK_HOPS) {
			throw new ActionableError(`"${filePath}" has too many levels of symbolic links.`);
		}

		// follow the raw symlink target without lexically collapsing `..` first
		const rawTarget = fs.readlinkSync(next);
		if (path.isAbsolute(rawTarget) || (process.platform === "win32" && WINDOWS_DRIVE_RELATIVE.test(rawTarget))) {
			const decomposed = decomposePath(rawTarget, current);
			current = decomposed.root;
			pending.unshift(...decomposed.segments);
		} else {
			pending.unshift(...splitPathSegments(rawTarget));
		}
	}

	return current;
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
			`"${dir}" is not in the list of allowed directories. Allowed directories: ${allowedRoots.join(", ")}.`
		);
	}
}

// a sibling of `to` with an unguessable name, created with O_EXCL ("wx"), so a
// file or link planted there makes the write fail instead of redirecting it
function partialPathFor(to: string): string {
	return path.join(path.dirname(to), `.${path.basename(to)}.${randomBytes(8).toString("hex")}.partial`);
}

// write next to `filePath` and rename over it: rename replaces whatever sits at
// `filePath` (a symlink, a hard link, a regular file) instead of writing through
// it, so a link can never point the write at another file
export function writeOutputFile(filePath: string, data: string | Buffer): void {
	const partial = partialPathFor(filePath);
	const existing = fs.lstatSync(filePath, { throwIfNoEntry: false });
	try {
		// 0600 while half-written; a link at `filePath` is replaced, so only a
		// regular file there passes its mode on to the new file
		fs.writeFileSync(partial, data, { flag: "wx", mode: 0o600 });
		if (existing?.isFile()) {
			fs.chmodSync(partial, existing.mode & 0o777);
		}

		fs.renameSync(partial, filePath);
	} catch (error) {
		fs.rmSync(partial, { force: true });
		throw error;
	}
}

// a fresh 0700 directory nobody else can plant a symlink in, for files written
// by mobilecli rather than by us
export function createPrivateOutputPath(filename: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-mcp-"));
	return path.join(dir, filename);
}

// rename replaces a symlink at `to` instead of following it. Across filesystems
// rename fails with EXDEV, so copy next to `to` first (COPYFILE_EXCL refuses an
// existing path) and rename that over `to`, keeping `to` intact if the copy fails
export function moveOutputFile(from: string, to: string): void {
	try {
		fs.renameSync(from, to);
		return;
	} catch (error: any) {
		if (error.code !== "EXDEV") {
			throw error;
		}

	}

	const partial = partialPathFor(to);
	try {
		fs.copyFileSync(from, partial, fs.constants.COPYFILE_EXCL);
		fs.renameSync(partial, to);
	} catch (error) {
		fs.rmSync(partial, { force: true });
		throw error;
	}

	fs.rmSync(from);
}

// moves a finished recording from its private directory to the requested
// output; returns an error message when that fails, so stop can report it
export function finishRecording(recordingPath: string, outputPath: string): string | undefined {
	if (!fs.existsSync(recordingPath)) {
		return "mobilecli did not produce a recording";
	}

	if (recordingPath === outputPath) {
		return undefined;
	}

	try {
		validateOutputPath(outputPath);
		moveOutputFile(recordingPath, outputPath);
	} catch (error: any) {
		// keep the private directory, the recording is still in it
		return error.message;
	}

	fs.rmSync(path.dirname(recordingPath), { recursive: true, force: true });
	return undefined;
}

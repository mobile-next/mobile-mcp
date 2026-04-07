"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePackageName = validatePackageName;
exports.validateLocale = validateLocale;
exports.validateFileExtension = validateFileExtension;
exports.validateOutputPath = validateOutputPath;
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_fs_1 = __importDefault(require("node:fs"));
const robot_1 = require("./robot");
function validatePackageName(packageName) {
    if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
        throw new robot_1.ActionableError(`Invalid package name: "${packageName}"`);
    }
}
function validateLocale(locale) {
    if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
        throw new robot_1.ActionableError(`Invalid locale: "${locale}"`);
    }
}
function getAllowedRoots() {
    const roots = [
        node_os_1.default.tmpdir(),
        process.cwd(),
    ];
    // macOS /tmp is a symlink to /private/tmp, add both to be safe
    if (process.platform === "darwin") {
        roots.push("/tmp");
        roots.push("/private/tmp");
    }
    return roots.map(r => node_path_1.default.resolve(r));
}
function isPathUnderRoot(filePath, root) {
    const relative = node_path_1.default.relative(root, filePath);
    if (relative === "") {
        return false;
    }
    if (node_path_1.default.isAbsolute(relative)) {
        return false;
    }
    if (relative.startsWith("..")) {
        return false;
    }
    return true;
}
function validateFileExtension(filePath, allowedExtensions, toolName) {
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        throw new robot_1.ActionableError(`${toolName} requires a ${allowedExtensions.join(", ")} file extension, got: "${ext || "(none)"}"`);
    }
}
function resolveWithSymlinks(filePath) {
    const resolved = node_path_1.default.resolve(filePath);
    const dir = node_path_1.default.dirname(resolved);
    const filename = node_path_1.default.basename(resolved);
    try {
        return node_path_1.default.join(node_fs_1.default.realpathSync(dir), filename);
    }
    catch {
        return resolved;
    }
}
function validateOutputPath(filePath) {
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
        const dir = node_path_1.default.dirname(resolved);
        throw new robot_1.ActionableError(`"${dir}" is not in the list of allowed directories. Allowed directories include the current directory and the temp directory on this host.`);
    }
}

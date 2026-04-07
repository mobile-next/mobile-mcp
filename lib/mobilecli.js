"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mobilecli = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;
class Mobilecli {
    path = null;
    constructor() { }
    getPath() {
        if (!this.path) {
            this.path = Mobilecli.getMobilecliPath();
        }
        return this.path;
    }
    executeCommand(args) {
        const path = this.getPath();
        return (0, node_child_process_1.execFileSync)(path, args, { encoding: "utf8" }).toString().trim();
    }
    spawnCommand(args) {
        const binaryPath = this.getPath();
        return (0, node_child_process_1.spawn)(binaryPath, args, {
            stdio: ["ignore", "ignore", "ignore"],
        });
    }
    executeCommandBuffer(args) {
        const path = this.getPath();
        return (0, node_child_process_1.execFileSync)(path, args, {
            encoding: "buffer",
            maxBuffer: MAX_BUFFER_SIZE,
            timeout: TIMEOUT,
        });
    }
    static getMobilecliPath() {
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
        const pathParts = currentPath.split(node_path_1.sep);
        const lastNodeModulesIndex = pathParts.lastIndexOf("node_modules");
        if (lastNodeModulesIndex !== -1) {
            // We're inside node_modules, go to the last node_modules in the path
            const nodeModulesParts = pathParts.slice(0, lastNodeModulesIndex + 1);
            const lastNodeModulesPath = nodeModulesParts.join(node_path_1.sep);
            const mobilecliPath = (0, node_path_1.join)(lastNodeModulesPath, "@mobilenext", "mobilecli", "bin", binaryName);
            if ((0, node_fs_1.existsSync)(mobilecliPath)) {
                return mobilecliPath;
            }
        }
        // Not in node_modules, look one directory up from current script
        const scriptDir = (0, node_path_1.dirname)(__filename);
        const parentDir = (0, node_path_1.dirname)(scriptDir);
        const mobilecliPath = (0, node_path_1.join)(parentDir, "node_modules", "@mobilenext", "mobilecli", "bin", binaryName);
        if ((0, node_fs_1.existsSync)(mobilecliPath)) {
            return mobilecliPath;
        }
        throw new Error(`Could not find mobilecli binary for platform: ${platform}`);
    }
    getVersion() {
        try {
            const output = this.executeCommand(["--version"]);
            if (output.startsWith("mobilecli version ")) {
                return output.substring("mobilecli version ".length);
            }
            return "failed";
        }
        catch (error) {
            return "failed " + error.message;
        }
    }
    fleetListDevices() {
        return this.executeCommand(["fleet", "list-devices"]);
    }
    fleetAllocate(platform) {
        return this.executeCommand(["fleet", "allocate", "--platform", platform]);
    }
    fleetRelease(deviceId) {
        return this.executeCommand(["fleet", "release", "--device", deviceId]);
    }
    getDevices(options) {
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
        return JSON.parse(mobilecliOutput);
    }
}
exports.Mobilecli = Mobilecli;

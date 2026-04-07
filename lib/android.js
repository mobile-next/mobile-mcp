"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AndroidDeviceManager = exports.AndroidRobot = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const xml = __importStar(require("fast-xml-parser"));
const robot_1 = require("./robot");
const utils_1 = require("./utils");
const getAdbPath = () => {
    const exeName = process.env.platform === "win32" ? "adb.exe" : "adb";
    if (process.env.ANDROID_HOME) {
        return node_path_1.default.join(process.env.ANDROID_HOME, "platform-tools", exeName);
    }
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
        const windowsAdbPath = node_path_1.default.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe");
        if ((0, node_fs_1.existsSync)(windowsAdbPath)) {
            return windowsAdbPath;
        }
    }
    if (process.platform === "darwin" && process.env.HOME) {
        const defaultAndroidSdk = node_path_1.default.join(process.env.HOME, "Library", "Android", "sdk", "platform-tools", "adb");
        if ((0, node_fs_1.existsSync)(defaultAndroidSdk)) {
            return defaultAndroidSdk;
        }
    }
    // fallthrough, hope for the best
    return exeName;
};
const BUTTON_MAP = {
    "BACK": "KEYCODE_BACK",
    "HOME": "KEYCODE_HOME",
    "VOLUME_UP": "KEYCODE_VOLUME_UP",
    "VOLUME_DOWN": "KEYCODE_VOLUME_DOWN",
    "ENTER": "KEYCODE_ENTER",
    "DPAD_CENTER": "KEYCODE_DPAD_CENTER",
    "DPAD_UP": "KEYCODE_DPAD_UP",
    "DPAD_DOWN": "KEYCODE_DPAD_DOWN",
    "DPAD_LEFT": "KEYCODE_DPAD_LEFT",
    "DPAD_RIGHT": "KEYCODE_DPAD_RIGHT",
};
const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;
class AndroidRobot {
    deviceId;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    adb(...args) {
        return (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", this.deviceId, ...args], {
            maxBuffer: MAX_BUFFER_SIZE,
            timeout: TIMEOUT,
        });
    }
    silentAdb(...args) {
        return (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", this.deviceId, ...args], {
            maxBuffer: MAX_BUFFER_SIZE,
            timeout: TIMEOUT,
            stdio: ["pipe", "pipe", "pipe"],
        });
    }
    getSystemFeatures() {
        return this.adb("shell", "pm", "list", "features")
            .toString()
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("feature:"))
            .map(line => line.substring("feature:".length));
    }
    async getScreenSize() {
        const screenSize = this.adb("shell", "wm", "size")
            .toString()
            .split(" ")
            .pop();
        if (!screenSize) {
            throw new Error("Failed to get screen size");
        }
        const scale = 1;
        const [width, height] = screenSize.split("x").map(Number);
        return { width, height, scale };
    }
    async listApps() {
        // only apps that have a launcher activity are returned
        return this.adb("shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
            .toString()
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("packageName="))
            .map(line => line.substring("packageName=".length))
            .filter((value, index, self) => self.indexOf(value) === index)
            .map(packageName => ({
            packageName,
            appName: packageName,
        }));
    }
    async listPackages() {
        return this.adb("shell", "pm", "list", "packages")
            .toString()
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("package:"))
            .map(line => line.substring("package:".length));
    }
    async launchApp(packageName, locale) {
        (0, utils_1.validatePackageName)(packageName);
        if (locale) {
            (0, utils_1.validateLocale)(locale);
            try {
                this.silentAdb("shell", "cmd", "locale", "set-app-locales", packageName, "--locales", locale);
            }
            catch (error) {
                // set-app-locales requires Android 13+ (API 33), silently ignore on older versions
            }
        }
        try {
            this.silentAdb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
        }
        catch (error) {
            throw new robot_1.ActionableError(`Failed launching app with package name "${packageName}", please make sure it exists`);
        }
    }
    async listRunningProcesses() {
        return this.adb("shell", "ps", "-e")
            .toString()
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("u")) // non-system processes
            .map(line => line.split(/\s+/)[8]); // get process name
    }
    async swipe(direction) {
        const screenSize = await this.getScreenSize();
        const centerX = screenSize.width >> 1;
        let x0, y0, x1, y1;
        switch (direction) {
            case "up":
                x0 = x1 = centerX;
                y0 = Math.floor(screenSize.height * 0.80);
                y1 = Math.floor(screenSize.height * 0.20);
                break;
            case "down":
                x0 = x1 = centerX;
                y0 = Math.floor(screenSize.height * 0.20);
                y1 = Math.floor(screenSize.height * 0.80);
                break;
            case "left":
                x0 = Math.floor(screenSize.width * 0.80);
                x1 = Math.floor(screenSize.width * 0.20);
                y0 = y1 = Math.floor(screenSize.height * 0.50);
                break;
            case "right":
                x0 = Math.floor(screenSize.width * 0.20);
                x1 = Math.floor(screenSize.width * 0.80);
                y0 = y1 = Math.floor(screenSize.height * 0.50);
                break;
            default:
                throw new robot_1.ActionableError(`Swipe direction "${direction}" is not supported`);
        }
        this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
    }
    async swipeFromCoordinate(x, y, direction, distance) {
        const screenSize = await this.getScreenSize();
        let x0, y0, x1, y1;
        // Use provided distance or default to 30% of screen dimension
        const defaultDistanceY = Math.floor(screenSize.height * 0.3);
        const defaultDistanceX = Math.floor(screenSize.width * 0.3);
        const swipeDistanceY = distance || defaultDistanceY;
        const swipeDistanceX = distance || defaultDistanceX;
        switch (direction) {
            case "up":
                x0 = x1 = x;
                y0 = y;
                y1 = Math.max(0, y - swipeDistanceY);
                break;
            case "down":
                x0 = x1 = x;
                y0 = y;
                y1 = Math.min(screenSize.height, y + swipeDistanceY);
                break;
            case "left":
                x0 = x;
                x1 = Math.max(0, x - swipeDistanceX);
                y0 = y1 = y;
                break;
            case "right":
                x0 = x;
                x1 = Math.min(screenSize.width, x + swipeDistanceX);
                y0 = y1 = y;
                break;
            default:
                throw new robot_1.ActionableError(`Swipe direction "${direction}" is not supported`);
        }
        this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
    }
    getDisplayCount() {
        return this.adb("shell", "dumpsys", "SurfaceFlinger", "--display-id")
            .toString()
            .split("\n")
            .filter(s => s.startsWith("Display "))
            .length;
    }
    getFirstDisplayId() {
        try {
            // Try using cmd display get-displays (Android 11+)
            const displays = this.adb("shell", "cmd", "display", "get-displays")
                .toString()
                .split("\n")
                .filter(s => s.startsWith("Display id "))
                // filter for state ON even though get-displays only returns turned on displays
                .filter(s => s.indexOf(", state ON,") >= 0)
                // another paranoia check
                .filter(s => s.indexOf(", uniqueId ") >= 0);
            if (displays.length > 0) {
                const m = displays[0].match(/uniqueId \"([^\"]+)\"/);
                if (m !== null) {
                    let displayId = m[1];
                    if (displayId.startsWith("local:")) {
                        displayId = displayId.substring("local:".length);
                    }
                    return displayId;
                }
            }
        }
        catch (error) {
            // cmd display get-displays not available on this device
        }
        // fallback: parse dumpsys display for display info (compatible with older Android versions)
        try {
            const dumpsys = this.adb("shell", "dumpsys", "display")
                .toString();
            // look for DisplayViewport entries with isActive=true and type=INTERNAL
            const viewportMatch = dumpsys.match(/DisplayViewport\{type=INTERNAL[^}]*isActive=true[^}]*uniqueId='([^']+)'/);
            if (viewportMatch) {
                let uniqueId = viewportMatch[1];
                if (uniqueId.startsWith("local:")) {
                    uniqueId = uniqueId.substring("local:".length);
                }
                return uniqueId;
            }
            // fallback: look for active display with state ON
            const displayStateMatch = dumpsys.match(/Display Id=(\d+)[\s\S]*?Display State=ON/);
            if (displayStateMatch) {
                return displayStateMatch[1];
            }
        }
        catch (error) {
            // dumpsys display also failed
        }
        return null;
    }
    async getScreenshot() {
        if (this.getDisplayCount() <= 1) {
            // backward compatibility for android 10 and below, and for single display devices
            return this.adb("exec-out", "screencap", "-p");
        }
        // find the first display that is turned on, and capture that one
        const displayId = this.getFirstDisplayId();
        if (displayId === null) {
            // no idea why, but we have displayCount >= 2, yet we failed to parse
            // let's go with screencap's defaults and hope for the best
            return this.adb("exec-out", "screencap", "-p");
        }
        return this.adb("exec-out", "screencap", "-p", "-d", `${displayId}`);
    }
    collectElements(node) {
        const elements = [];
        if (node.node) {
            if (Array.isArray(node.node)) {
                for (const childNode of node.node) {
                    elements.push(...this.collectElements(childNode));
                }
            }
            else {
                elements.push(...this.collectElements(node.node));
            }
        }
        if (node.text || node["content-desc"] || node.hint || node["resource-id"] || node.checkable === "true" || node.password === "true" || node.focusable === "true" || (node.clickable === "true" && node.class)) {
            const element = {
                type: node.class || "text",
                text: node.text,
                label: node["content-desc"] || node.hint || "",
                rect: this.getScreenElementRect(node),
            };
            if (node.focused === "true") {
                element.focused = true;
            }
            if (node.password === "true") {
                element.password = true;
            }
            if (node.clickable === "true") {
                element.clickable = true;
            }
            if (node.editable === "true" || (node.class && node.class.toLowerCase().includes("edittext"))) {
                element.editable = true;
            }
            if (node.scrollable === "true") {
                element.scrollable = true;
            }
            if (element.password || element.editable) {
                element.value = node.text || "";
            }
            const resourceId = node["resource-id"];
            if (resourceId !== null && resourceId !== "") {
                element.identifier = resourceId;
            }
            if (element.rect.width > 0 && element.rect.height > 0) {
                elements.push(element);
            }
        }
        return elements;
    }
    async getElementsOnScreen() {
        const parsedXml = await this.getUiAutomatorXml();
        const hierarchy = parsedXml.hierarchy;
        const elements = this.collectElements(hierarchy.node);
        return elements;
    }
    async terminateApp(packageName) {
        (0, utils_1.validatePackageName)(packageName);
        this.adb("shell", "am", "force-stop", packageName);
    }
    async installApp(path) {
        try {
            this.adb("install", "-r", path);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
    }
    async uninstallApp(bundleId) {
        try {
            this.adb("uninstall", bundleId);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
    }
    async openUrl(url) {
        this.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", this.escapeShellText(url));
    }
    isAscii(text) {
        return /^[\x00-\x7F]*$/.test(text);
    }
    escapeShellText(text) {
        // escape all shell special characters that could be used for injection
        return text.replace(/[\\'"` \t\n\r|&;()<>{}[\]$*?]/g, "\\$&");
    }
    async isDeviceKitInstalled() {
        const packages = await this.listPackages();
        return packages.includes("com.mobilenext.devicekit");
    }
    async sendKeys(text) {
        if (text === "") {
            // bailing early, so we don't run adb shell with empty string.
            // this happens when you prompt with a simple "submit".
            return;
        }
        if (this.isAscii(text)) {
            // adb shell input only supports ascii characters. and
            // some of the keys have to be escaped.
            const _text = this.escapeShellText(text);
            this.adb("shell", "input", "text", _text);
        }
        else if (await this.isDeviceKitInstalled()) {
            // try sending over clipboard
            const base64 = Buffer.from(text).toString("base64");
            // send clipboard over and immediately paste it
            this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.set", "-e", "encoding", "base64", "-e", "text", base64, "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
            this.adb("shell", "input", "keyevent", "KEYCODE_PASTE");
            // clear clipboard when we're done
            this.adb("shell", "am", "broadcast", "-a", "devicekit.clipboard.clear", "-n", "com.mobilenext.devicekit/.ClipboardBroadcastReceiver");
        }
        else {
            throw new robot_1.ActionableError("Non-ASCII text is not supported on Android, please install mobilenext devicekit, see https://github.com/mobile-next/devicekit-android");
        }
    }
    async pressButton(button) {
        if (!BUTTON_MAP[button]) {
            throw new robot_1.ActionableError(`Button "${button}" is not supported`);
        }
        const mapped = BUTTON_MAP[button];
        this.adb("shell", "input", "keyevent", mapped);
    }
    async tap(x, y) {
        this.adb("shell", "input", "tap", `${x}`, `${y}`);
    }
    async longPress(x, y, duration) {
        // a long press is a swipe with no movement and a long duration
        this.adb("shell", "input", "swipe", `${x}`, `${y}`, `${x}`, `${y}`, `${duration}`);
    }
    async doubleTap(x, y) {
        await this.tap(x, y);
        await new Promise(r => setTimeout(r, 100)); // short delay
        await this.tap(x, y);
    }
    async setOrientation(orientation) {
        const value = orientation === "portrait" ? 0 : 1;
        // disable auto-rotation prior to setting the orientation
        this.adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
        this.adb("shell", "content", "insert", "--uri", "content://settings/system", "--bind", "name:s:user_rotation", "--bind", `value:i:${value}`);
    }
    async getOrientation() {
        const rotation = this.adb("shell", "settings", "get", "system", "user_rotation").toString().trim();
        return rotation === "0" ? "portrait" : "landscape";
    }
    async getUiAutomatorDump() {
        for (let tries = 0; tries < 3; tries++) {
            try {
                const dump = this.adb("exec-out", "uiautomator", "dump", "/dev/tty").toString();
                if (dump.includes("null root node returned by UiTestAutomationBridge")) {
                    continue;
                }
                if (dump.includes("could not get idle state")) {
                    // React Native / animated apps block uiautomator idle detection — fall through to DEX
                    break;
                }
                const xmlStart = dump.indexOf("<?xml");
                if (xmlStart >= 0) {
                    return dump.substring(xmlStart);
                }
            }
            catch {
                // uiautomator command failed — try again or fall through to DEX
                continue;
            }
        }
        // Fallback: DEX hierarchy dumper bypasses idle check via UiAutomation.getRootInActiveWindow()
        return this.getDexHierarchyDump();
    }
    ensureDexOnDevice() {
        // Check if DEX already exists on device
        try {
            const check = this.adb("shell", "test", "-f", "/data/local/tmp/hierarchy-dumper.dex", "&&", "echo", "OK").toString().trim();
            if (check === "OK") {
                return;
            }
        }
        catch {
            // file doesn't exist, push it
        }
        // Find the bundled DEX file relative to this module
        const assetPath = node_path_1.default.resolve(__dirname, "..", "assets", "hierarchy-dumper.dex");
        if (!(0, node_fs_1.existsSync)(assetPath)) {
            throw new robot_1.ActionableError("hierarchy-dumper.dex not found in mobile-mcp assets. Reinstall mobile-mcp or manually push the DEX to /data/local/tmp/hierarchy-dumper.dex");
        }
        // Push to device
        (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", this.deviceId, "push", assetPath, "/data/local/tmp/hierarchy-dumper.dex"], {
            timeout: TIMEOUT,
        });
    }
    getDexHierarchyDump() {
        const dexPath = "/data/local/tmp/hierarchy-dumper.dex";
        const outPath = "/data/local/tmp/mobile-mcp-dump.xml";
        this.ensureDexOnDevice();
        try {
            this.adb("shell", `CLASSPATH=${dexPath} app_process / HierarchyDumper ${outPath}`);
        }
        catch (error) {
            // app_process writes to stderr even on success (ServiceManager fallback messages)
            // Check if the output file was created despite the "error"
            try {
                const check = this.adb("shell", "test", "-f", outPath, "&&", "echo", "OK").toString().trim();
                if (check !== "OK") {
                    throw new robot_1.ActionableError(`DEX hierarchy dumper failed: ${error.message}`);
                }
            }
            catch {
                throw new robot_1.ActionableError(`DEX hierarchy dumper failed: ${error.message}`);
            }
        }
        const xml = this.adb("shell", "cat", outPath).toString();
        const xmlStart = xml.indexOf("<?xml");
        if (xmlStart < 0) {
            throw new robot_1.ActionableError("DEX hierarchy dumper produced no valid XML output");
        }
        return xml.substring(xmlStart);
    }
    async getUiAutomatorXml() {
        const dump = await this.getUiAutomatorDump();
        const parser = new xml.XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
        });
        return parser.parse(dump);
    }
    getScreenElementRect(node) {
        const bounds = String(node.bounds);
        const [, left, top, right, bottom] = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.map(Number) || [];
        return {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        };
    }
}
exports.AndroidRobot = AndroidRobot;
class AndroidDeviceManager {
    getDeviceType(name) {
        try {
            const device = new AndroidRobot(name);
            const features = device.getSystemFeatures();
            if (features.includes("android.software.leanback") || features.includes("android.hardware.type.television")) {
                return "tv";
            }
            return "mobile";
        }
        catch (error) {
            // Fallback to mobile if we cannot determine device type
            return "mobile";
        }
    }
    getDeviceVersion(deviceId) {
        try {
            const output = (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.build.version.release"], {
                timeout: 5000,
            }).toString().trim();
            return output;
        }
        catch (error) {
            return "unknown";
        }
    }
    getDeviceName(deviceId) {
        try {
            // Try getting AVD name first (for emulators)
            const avdName = (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.boot.qemu.avd_name"], {
                timeout: 5000,
            }).toString().trim();
            if (avdName !== "") {
                // Replace underscores with spaces (e.g., "Pixel_9_Pro" -> "Pixel 9 Pro")
                return avdName.replace(/_/g, " ");
            }
            // Fall back to product model
            const output = (0, node_child_process_1.execFileSync)(getAdbPath(), ["-s", deviceId, "shell", "getprop", "ro.product.model"], {
                timeout: 5000,
            }).toString().trim();
            return output;
        }
        catch (error) {
            return deviceId;
        }
    }
    getConnectedDevices() {
        try {
            const names = (0, node_child_process_1.execFileSync)(getAdbPath(), ["devices"])
                .toString()
                .split("\n")
                .map(line => line.trim())
                .filter(line => line !== "")
                .filter(line => !line.startsWith("List of devices attached"))
                .filter(line => line.split("\t")[1]?.trim() === "device") // Only include devices that are online and ready
                .map(line => line.split("\t")[0]);
            return names.map(name => ({
                deviceId: name,
                deviceType: this.getDeviceType(name),
            }));
        }
        catch (error) {
            console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
            return [];
        }
    }
    getConnectedDevicesWithDetails() {
        try {
            const names = (0, node_child_process_1.execFileSync)(getAdbPath(), ["devices"])
                .toString()
                .split("\n")
                .map(line => line.trim())
                .filter(line => line !== "")
                .filter(line => !line.startsWith("List of devices attached"))
                .filter(line => line.split("\t")[1]?.trim() === "device") // Only include devices that are online and ready
                .map(line => line.split("\t")[0]);
            return names.map(deviceId => ({
                deviceId,
                deviceType: this.getDeviceType(deviceId),
                version: this.getDeviceVersion(deviceId),
                name: this.getDeviceName(deviceId),
            }));
        }
        catch (error) {
            console.error("Could not execute adb command, maybe ANDROID_HOME is not set?");
            return [];
        }
    }
}
exports.AndroidDeviceManager = AndroidDeviceManager;

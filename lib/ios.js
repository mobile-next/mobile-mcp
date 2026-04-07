"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IosManager = exports.IosRobot = void 0;
const node_net_1 = require("node:net");
const node_child_process_1 = require("node:child_process");
const webdriver_agent_1 = require("./webdriver-agent");
const robot_1 = require("./robot");
const utils_1 = require("./utils");
const WDA_PORT = 8100;
const IOS_TUNNEL_PORT = 60105;
const getGoIosPath = () => {
    if (process.env.GO_IOS_PATH) {
        return process.env.GO_IOS_PATH;
    }
    // fallback to go-ios in PATH via `npm install -g go-ios`
    return "ios";
};
class IosRobot {
    deviceId;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    isListeningOnPort(port) {
        return new Promise((resolve, reject) => {
            const client = new node_net_1.Socket();
            client.connect(port, "localhost", () => {
                client.destroy();
                resolve(true);
            });
            client.on("error", (err) => {
                resolve(false);
            });
        });
    }
    async isTunnelRunning() {
        return await this.isListeningOnPort(IOS_TUNNEL_PORT);
    }
    async isWdaForwardRunning() {
        return await this.isListeningOnPort(WDA_PORT);
    }
    async assertTunnelRunning() {
        if (await this.isTunnelRequired()) {
            if (!(await this.isTunnelRunning())) {
                throw new robot_1.ActionableError("iOS tunnel is not running, please see https://github.com/mobile-next/mobile-mcp/wiki/");
            }
        }
    }
    async wda() {
        await this.assertTunnelRunning();
        if (!(await this.isWdaForwardRunning())) {
            throw new robot_1.ActionableError("Port forwarding to WebDriverAgent is not running (tunnel okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
        }
        const wda = new webdriver_agent_1.WebDriverAgent("localhost", WDA_PORT);
        if (!(await wda.isRunning())) {
            throw new robot_1.ActionableError("WebDriverAgent is not running on device (tunnel okay, port forwarding okay), please see https://github.com/mobile-next/mobile-mcp/wiki/");
        }
        return wda;
    }
    async ios(...args) {
        return (0, node_child_process_1.execFileSync)(getGoIosPath(), ["--udid", this.deviceId, ...args], {}).toString();
    }
    async getIosVersion() {
        const output = await this.ios("info");
        const json = JSON.parse(output);
        return json.ProductVersion;
    }
    async isTunnelRequired() {
        const version = await this.getIosVersion();
        const args = version.split(".");
        return parseInt(args[0], 10) >= 17;
    }
    async getScreenSize() {
        const wda = await this.wda();
        return await wda.getScreenSize();
    }
    async swipe(direction) {
        const wda = await this.wda();
        await wda.swipe(direction);
    }
    async swipeFromCoordinate(x, y, direction, distance) {
        const wda = await this.wda();
        await wda.swipeFromCoordinate(x, y, direction, distance);
    }
    async listApps() {
        await this.assertTunnelRunning();
        const output = await this.ios("apps", "--all", "--list");
        return output
            .split("\n")
            .map(line => {
            const [packageName, appName] = line.split(" ");
            return {
                packageName,
                appName,
            };
        });
    }
    async launchApp(packageName, locale) {
        (0, utils_1.validatePackageName)(packageName);
        await this.assertTunnelRunning();
        const args = ["launch", packageName];
        if (locale) {
            (0, utils_1.validateLocale)(locale);
            const locales = locale.split(",").map(l => l.trim());
            args.push("-AppleLanguages", `(${locales.join(", ")})`);
            args.push("-AppleLocale", locales[0]);
        }
        await this.ios(...args);
    }
    async terminateApp(packageName) {
        (0, utils_1.validatePackageName)(packageName);
        await this.assertTunnelRunning();
        await this.ios("kill", packageName);
    }
    async installApp(path) {
        await this.assertTunnelRunning();
        try {
            await this.ios("install", "--path", path);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
    }
    async uninstallApp(bundleId) {
        await this.assertTunnelRunning();
        try {
            await this.ios("uninstall", "--bundleid", bundleId);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
    }
    async openUrl(url) {
        const wda = await this.wda();
        await wda.openUrl(url);
    }
    async sendKeys(text) {
        const wda = await this.wda();
        await wda.sendKeys(text);
    }
    async pressButton(button) {
        const wda = await this.wda();
        await wda.pressButton(button);
    }
    async dismissKeyboard() {
        const wda = await this.wda();
        await wda.pressButton("home");
        await new Promise(r => setTimeout(r, 100));
        // Re-open app — home dismisses keyboard but also backgrounds the app
        // Better approach: tap a non-interactive area
        const screenSize = await this.getScreenSize();
        await wda.tap(Math.floor(screenSize.width / 2), 10);
    }
    async tap(x, y) {
        const wda = await this.wda();
        await wda.tap(x, y);
    }
    async doubleTap(x, y) {
        const wda = await this.wda();
        await wda.doubleTap(x, y);
    }
    async longPress(x, y, duration) {
        const wda = await this.wda();
        await wda.longPress(x, y, duration);
    }
    async getElementsOnScreen() {
        const wda = await this.wda();
        return await wda.getElementsOnScreen();
    }
    async getScreenshot() {
        const wda = await this.wda();
        return await wda.getScreenshot();
        /* alternative:
        await this.assertTunnelRunning();
        const tmpFilename = path.join(tmpdir(), `screenshot-${randomBytes(8).toString("hex")}.png`);
        await this.ios("screenshot", "--output", tmpFilename);
        const buffer = readFileSync(tmpFilename);
        unlinkSync(tmpFilename);
        return buffer;
        */
    }
    async setOrientation(orientation) {
        const wda = await this.wda();
        await wda.setOrientation(orientation);
    }
    async getOrientation() {
        const wda = await this.wda();
        return await wda.getOrientation();
    }
}
exports.IosRobot = IosRobot;
class IosManager {
    isGoIosInstalled() {
        try {
            const output = (0, node_child_process_1.execFileSync)(getGoIosPath(), ["version"], { stdio: ["pipe", "pipe", "ignore"] }).toString();
            const json = JSON.parse(output);
            return json.version !== undefined && (json.version.startsWith("v") || json.version === "local-build");
        }
        catch (error) {
            return false;
        }
    }
    getDeviceName(deviceId) {
        const output = (0, node_child_process_1.execFileSync)(getGoIosPath(), ["info", "--udid", deviceId]).toString();
        const json = JSON.parse(output);
        return json.DeviceName;
    }
    getDeviceInfo(deviceId) {
        const output = (0, node_child_process_1.execFileSync)(getGoIosPath(), ["info", "--udid", deviceId]).toString();
        const json = JSON.parse(output);
        return json;
    }
    listDevices() {
        if (!this.isGoIosInstalled()) {
            console.error("go-ios is not installed, no physical iOS devices can be detected");
            return [];
        }
        const output = (0, node_child_process_1.execFileSync)(getGoIosPath(), ["list"]).toString();
        const json = JSON.parse(output);
        const devices = json.deviceList.map(device => ({
            deviceId: device,
            deviceName: this.getDeviceName(device),
        }));
        return devices;
    }
    listDevicesWithDetails() {
        if (!this.isGoIosInstalled()) {
            console.error("go-ios is not installed, no physical iOS devices can be detected");
            return [];
        }
        const output = (0, node_child_process_1.execFileSync)(getGoIosPath(), ["list"]).toString();
        const json = JSON.parse(output);
        const devices = json.deviceList.map(device => {
            const info = this.getDeviceInfo(device);
            return {
                deviceId: device,
                deviceName: info.DeviceName,
                version: info.ProductVersion,
            };
        });
        return devices;
    }
}
exports.IosManager = IosManager;

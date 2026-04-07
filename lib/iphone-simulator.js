"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simctl = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const logger_1 = require("./logger");
const webdriver_agent_1 = require("./webdriver-agent");
const robot_1 = require("./robot");
const utils_1 = require("./utils");
const TIMEOUT = 30000;
const WDA_PORT = 8100;
const MAX_BUFFER_SIZE = 1024 * 1024 * 8;
class Simctl {
    simulatorUuid;
    constructor(simulatorUuid) {
        this.simulatorUuid = simulatorUuid;
    }
    async isWdaInstalled() {
        const apps = await this.listApps();
        return apps.map(app => app.packageName).includes("com.facebook.WebDriverAgentRunner.xctrunner");
    }
    async startWda() {
        if (!(await this.isWdaInstalled())) {
            // wda is not even installed, won't attempt to start it
            return;
        }
        (0, logger_1.trace)("Starting WebDriverAgent");
        const webdriverPackageName = "com.facebook.WebDriverAgentRunner.xctrunner";
        this.simctl("launch", this.simulatorUuid, webdriverPackageName);
        // now we wait for wda to have a successful status
        const wda = new webdriver_agent_1.WebDriverAgent("localhost", WDA_PORT);
        // wait up to 10 seconds for wda to start
        const timeout = +new Date() + 10 * 1000;
        while (+new Date() < timeout) {
            // cross fingers and see if wda is already running
            if (await wda.isRunning()) {
                (0, logger_1.trace)("WebDriverAgent is now running");
                return;
            }
            // wait 100ms before trying again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        (0, logger_1.trace)("Could not start WebDriverAgent in time, giving up");
    }
    async wda() {
        const wda = new webdriver_agent_1.WebDriverAgent("localhost", WDA_PORT);
        if (!(await wda.isRunning())) {
            await this.startWda();
            if (!(await wda.isRunning())) {
                throw new robot_1.ActionableError("WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/");
            }
            // was successfully started
        }
        return wda;
    }
    simctl(...args) {
        return (0, node_child_process_1.execFileSync)("xcrun", ["simctl", ...args], {
            timeout: TIMEOUT,
            maxBuffer: MAX_BUFFER_SIZE,
        });
    }
    async getScreenshot() {
        const wda = await this.wda();
        return await wda.getScreenshot();
        // alternative: return this.simctl("io", this.simulatorUuid, "screenshot", "-");
    }
    async openUrl(url) {
        const wda = await this.wda();
        await wda.openUrl(url);
        // alternative: this.simctl("openurl", this.simulatorUuid, url);
    }
    async launchApp(packageName, locale) {
        (0, utils_1.validatePackageName)(packageName);
        const args = ["launch", this.simulatorUuid, packageName];
        if (locale) {
            (0, utils_1.validateLocale)(locale);
            const locales = locale.split(",").map(l => l.trim());
            args.push("-AppleLanguages", `(${locales.join(", ")})`);
            args.push("-AppleLocale", locales[0]);
        }
        this.simctl(...args);
    }
    async terminateApp(packageName) {
        (0, utils_1.validatePackageName)(packageName);
        this.simctl("terminate", this.simulatorUuid, packageName);
    }
    findAppBundle(dir) {
        const entries = (0, node_fs_1.readdirSync)(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.endsWith(".app")) {
                return (0, node_path_1.join)(dir, entry.name);
            }
        }
        return null;
    }
    validateZipPaths(zipPath) {
        const output = (0, node_child_process_1.execFileSync)("/usr/bin/zipinfo", ["-1", zipPath], {
            timeout: TIMEOUT,
            maxBuffer: MAX_BUFFER_SIZE,
        }).toString();
        const invalidPath = output
            .split("\n")
            .map(s => s.trim())
            .filter(s => s)
            .find(s => s.startsWith("/") || s.includes(".."));
        if (invalidPath) {
            throw new robot_1.ActionableError(`Security violation: File path '${invalidPath}' contains invalid characters`);
        }
    }
    async installApp(path) {
        let tempDir = null;
        let installPath = path;
        try {
            // zip files need to be extracted prior to installation
            if ((0, node_path_1.extname)(path).toLowerCase() === ".zip") {
                (0, logger_1.trace)(`Detected .zip file, validating contents`);
                // before extracting, let's make sure there's no zip-slip bombs here
                this.validateZipPaths(path);
                tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "ios-app-"));
                try {
                    (0, node_child_process_1.execFileSync)("unzip", ["-q", path, "-d", tempDir], {
                        timeout: TIMEOUT,
                    });
                }
                catch (error) {
                    throw new robot_1.ActionableError(`Failed to unzip file: ${error.message}`);
                }
                const appBundle = this.findAppBundle(tempDir);
                if (!appBundle) {
                    throw new robot_1.ActionableError("No .app bundle found in the .zip file, please visit wiki at https://github.com/mobile-next/mobile-mcp/wiki for assistance.");
                }
                installPath = appBundle;
                (0, logger_1.trace)(`Found .app bundle at: ${(0, node_path_1.basename)(appBundle)}`);
            }
            // continue with installation
            this.simctl("install", this.simulatorUuid, installPath);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
        finally {
            // Clean up temporary directory if it was created
            if (tempDir) {
                try {
                    (0, logger_1.trace)(`Cleaning up temporary directory`);
                    (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
                }
                catch (cleanupError) {
                    (0, logger_1.trace)(`Warning: Failed to cleanup temporary directory: ${cleanupError}`);
                }
            }
        }
    }
    async uninstallApp(bundleId) {
        try {
            this.simctl("uninstall", this.simulatorUuid, bundleId);
        }
        catch (error) {
            const stdout = error.stdout ? error.stdout.toString() : "";
            const stderr = error.stderr ? error.stderr.toString() : "";
            const output = (stdout + stderr).trim();
            throw new robot_1.ActionableError(output || error.message);
        }
    }
    async listApps() {
        const text = this.simctl("listapps", this.simulatorUuid).toString();
        const result = (0, node_child_process_1.execFileSync)("plutil", ["-convert", "json", "-o", "-", "-r", "-"], {
            input: text,
        });
        const output = JSON.parse(result.toString());
        return Object.values(output).map(app => ({
            packageName: app.CFBundleIdentifier,
            appName: app.CFBundleDisplayName,
        }));
    }
    async getScreenSize() {
        const wda = await this.wda();
        return wda.getScreenSize();
    }
    async sendKeys(keys) {
        const wda = await this.wda();
        return wda.sendKeys(keys);
    }
    async swipe(direction) {
        const wda = await this.wda();
        return wda.swipe(direction);
    }
    async swipeFromCoordinate(x, y, direction, distance) {
        const wda = await this.wda();
        return wda.swipeFromCoordinate(x, y, direction, distance);
    }
    async dismissKeyboard() {
        const wda = await this.wda();
        const screenSize = await this.getScreenSize();
        await wda.tap(Math.floor(screenSize.width / 2), 10);
    }
    async tap(x, y) {
        const wda = await this.wda();
        return wda.tap(x, y);
    }
    async doubleTap(x, y) {
        const wda = await this.wda();
        await wda.doubleTap(x, y);
    }
    async longPress(x, y, duration) {
        const wda = await this.wda();
        return wda.longPress(x, y, duration);
    }
    async pressButton(button) {
        const wda = await this.wda();
        return wda.pressButton(button);
    }
    async getElementsOnScreen() {
        const wda = await this.wda();
        return wda.getElementsOnScreen();
    }
    async setOrientation(orientation) {
        const wda = await this.wda();
        return wda.setOrientation(orientation);
    }
    async getOrientation() {
        const wda = await this.wda();
        return wda.getOrientation();
    }
}
exports.Simctl = Simctl;

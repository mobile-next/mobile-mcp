"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobileDevice = void 0;
const mobilecli_1 = require("./mobilecli");
class MobileDevice {
    deviceId;
    mobilecli;
    constructor(deviceId) {
        this.deviceId = deviceId;
        this.mobilecli = new mobilecli_1.Mobilecli();
    }
    runCommand(args) {
        const fullArgs = [...args, "--device", this.deviceId];
        return this.mobilecli.executeCommand(fullArgs);
    }
    async getScreenSize() {
        const response = JSON.parse(this.runCommand(["device", "info"]));
        if (response.data.device.screenSize) {
            return response.data.device.screenSize;
        }
        return { width: 0, height: 0, scale: 1.0 };
    }
    async swipe(direction) {
        const screenSize = await this.getScreenSize();
        const centerX = Math.floor(screenSize.width / 2);
        const centerY = Math.floor(screenSize.height / 2);
        const distance = 400; // Default distance in pixels
        let startX = centerX;
        let startY = centerY;
        let endX = centerX;
        let endY = centerY;
        switch (direction) {
            case "up":
                startY = centerY + distance / 2;
                endY = centerY - distance / 2;
                break;
            case "down":
                startY = centerY - distance / 2;
                endY = centerY + distance / 2;
                break;
            case "left":
                startX = centerX + distance / 2;
                endX = centerX - distance / 2;
                break;
            case "right":
                startX = centerX - distance / 2;
                endX = centerX + distance / 2;
                break;
        }
        this.runCommand(["io", "swipe", `${startX},${startY},${endX},${endY}`]);
    }
    async swipeFromCoordinate(x, y, direction, distance) {
        const swipeDistance = distance || 400;
        let endX = x;
        let endY = y;
        switch (direction) {
            case "up":
                endY = y - swipeDistance;
                break;
            case "down":
                endY = y + swipeDistance;
                break;
            case "left":
                endX = x - swipeDistance;
                break;
            case "right":
                endX = x + swipeDistance;
                break;
        }
        this.runCommand(["io", "swipe", `${x},${y},${endX},${endY}`]);
    }
    async getScreenshot() {
        const fullArgs = ["screenshot", "--device", this.deviceId, "--format", "png", "--output", "-"];
        return this.mobilecli.executeCommandBuffer(fullArgs);
    }
    async listApps() {
        const response = JSON.parse(this.runCommand(["apps", "list"]));
        return response.data.map(app => ({
            appName: app.appName || app.packageName,
            packageName: app.packageName,
        }));
    }
    async launchApp(packageName, locale) {
        const args = ["apps", "launch", packageName];
        if (locale) {
            args.push("--locale", locale);
        }
        this.runCommand(args);
    }
    async terminateApp(packageName) {
        this.runCommand(["apps", "terminate", packageName]);
    }
    async installApp(path) {
        this.runCommand(["apps", "install", path]);
    }
    async uninstallApp(bundleId) {
        this.runCommand(["apps", "uninstall", bundleId]);
    }
    async openUrl(url) {
        this.runCommand(["url", url]);
    }
    async sendKeys(text) {
        this.runCommand(["io", "text", text]);
    }
    async pressButton(button) {
        this.runCommand(["io", "button", button]);
    }
    async dismissKeyboard() {
        const screenSize = await this.getScreenSize();
        this.runCommand(["io", "tap", `${Math.floor(screenSize.width / 2)},10`]);
    }
    async tap(x, y) {
        this.runCommand(["io", "tap", `${x},${y}`]);
    }
    async doubleTap(x, y) {
        // TODO: should move into mobilecli itself as "io doubletap"
        await this.tap(x, y);
        await this.tap(x, y);
    }
    async longPress(x, y, duration) {
        this.runCommand(["io", "longpress", `${x},${y}`, "--duration", `${duration}`]);
    }
    async getElementsOnScreen() {
        const response = JSON.parse(this.runCommand(["dump", "ui"]));
        return response.data.elements.map(element => ({
            type: element.type,
            label: element.label,
            text: element.text,
            name: element.name,
            value: element.value,
            identifier: element.identifier,
            rect: element.rect,
            focused: element.focused,
        }));
    }
    async setOrientation(orientation) {
        this.runCommand(["device", "orientation", "set", orientation]);
    }
    async getOrientation() {
        const response = JSON.parse(this.runCommand(["device", "orientation", "get"]));
        return response.data.orientation;
    }
}
exports.MobileDevice = MobileDevice;

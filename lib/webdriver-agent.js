"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebDriverAgent = void 0;
const robot_1 = require("./robot");
class WebDriverAgent {
    host;
    port;
    constructor(host, port) {
        this.host = host;
        this.port = port;
    }
    async isRunning() {
        const url = `http://${this.host}:${this.port}/status`;
        try {
            const response = await fetch(url);
            const json = await response.json();
            return response.status === 200 && json.value?.ready === true;
        }
        catch (error) {
            // console.error(`Failed to connect to WebDriverAgent: ${error}`);
            return false;
        }
    }
    async createSession() {
        const url = `http://${this.host}:${this.port}/session`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new robot_1.ActionableError(`Failed to create WebDriver session: ${response.status} ${errorText}`);
        }
        const json = await response.json();
        if (!json.value || !json.value.sessionId) {
            throw new robot_1.ActionableError(`Invalid session response: ${JSON.stringify(json)}`);
        }
        return json.value.sessionId;
    }
    async deleteSession(sessionId) {
        const url = `http://${this.host}:${this.port}/session/${sessionId}`;
        const response = await fetch(url, { method: "DELETE" });
        return response.json();
    }
    async withinSession(fn) {
        const sessionId = await this.createSession();
        const url = `http://${this.host}:${this.port}/session/${sessionId}`;
        const result = await fn(url);
        await this.deleteSession(sessionId);
        return result;
    }
    async getScreenSize(sessionUrl) {
        if (sessionUrl) {
            const url = `${sessionUrl}/wda/screen`;
            const response = await fetch(url);
            const json = await response.json();
            return {
                width: json.value.screenSize.width,
                height: json.value.screenSize.height,
                scale: json.value.scale || 1,
            };
        }
        else {
            return this.withinSession(async (sessionUrlInner) => {
                const url = `${sessionUrlInner}/wda/screen`;
                const response = await fetch(url);
                const json = await response.json();
                return {
                    width: json.value.screenSize.width,
                    height: json.value.screenSize.height,
                    scale: json.value.scale || 1,
                };
            });
        }
    }
    async sendKeys(keys) {
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/wda/keys`;
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: [keys] }),
            });
        });
    }
    async pressButton(button) {
        const _map = {
            "HOME": "home",
            "VOLUME_UP": "volumeup",
            "VOLUME_DOWN": "volumedown",
        };
        if (button === "ENTER") {
            await this.sendKeys("\n");
            return;
        }
        // Type assertion to check if button is a key of _map
        if (!(button in _map)) {
            throw new robot_1.ActionableError(`Button "${button}" is not supported`);
        }
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/wda/pressButton`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: button,
                }),
            });
            return response.json();
        });
    }
    async tap(x, y) {
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/actions`;
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actions: [
                        {
                            type: "pointer",
                            id: "finger1",
                            parameters: { pointerType: "touch" },
                            actions: [
                                { type: "pointerMove", duration: 0, x, y },
                                { type: "pointerDown", button: 0 },
                                { type: "pause", duration: 100 },
                                { type: "pointerUp", button: 0 }
                            ]
                        }
                    ]
                }),
            });
        });
    }
    async doubleTap(x, y) {
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/actions`;
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actions: [
                        {
                            type: "pointer",
                            id: "finger1",
                            parameters: { pointerType: "touch" },
                            actions: [
                                { type: "pointerMove", duration: 0, x, y },
                                { type: "pointerDown", button: 0 },
                                { type: "pause", duration: 50 },
                                { type: "pointerUp", button: 0 },
                                { type: "pause", duration: 100 },
                                { type: "pointerDown", button: 0 },
                                { type: "pause", duration: 50 },
                                { type: "pointerUp", button: 0 }
                            ]
                        }
                    ]
                }),
            });
        });
    }
    async longPress(x, y, duration) {
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/actions`;
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actions: [
                        {
                            type: "pointer",
                            id: "finger1",
                            parameters: { pointerType: "touch" },
                            actions: [
                                { type: "pointerMove", duration: 0, x, y },
                                { type: "pointerDown", button: 0 },
                                { type: "pause", duration },
                                { type: "pointerUp", button: 0 }
                            ]
                        }
                    ]
                }),
            });
        });
    }
    isVisible(rect) {
        return rect.x >= 0 && rect.y >= 0;
    }
    filterSourceElements(source) {
        const output = [];
        const acceptedTypes = ["TextField", "Button", "Switch", "Icon", "SearchField", "StaticText", "Image"];
        if (acceptedTypes.includes(source.type)) {
            if (source.isVisible === "1" && this.isVisible(source.rect)) {
                if (source.label !== null || source.name !== null || source.rawIdentifier !== null) {
                    output.push({
                        type: source.type,
                        label: source.label,
                        name: source.name,
                        value: source.value,
                        identifier: source.rawIdentifier,
                        rect: {
                            x: source.rect.x,
                            y: source.rect.y,
                            width: source.rect.width,
                            height: source.rect.height,
                        },
                    });
                }
            }
        }
        if (source.children) {
            for (const child of source.children) {
                output.push(...this.filterSourceElements(child));
            }
        }
        return output;
    }
    async getPageSource() {
        const url = `http://${this.host}:${this.port}/source/?format=json`;
        const response = await fetch(url);
        const json = await response.json();
        return json;
    }
    async getElementsOnScreen() {
        const source = await this.getPageSource();
        return this.filterSourceElements(source.value);
    }
    async openUrl(url) {
        await this.withinSession(async (sessionUrl) => {
            await fetch(`${sessionUrl}/url`, {
                method: "POST",
                body: JSON.stringify({ url }),
            });
        });
    }
    async getScreenshot() {
        const url = `http://${this.host}:${this.port}/screenshot`;
        const response = await fetch(url);
        const json = await response.json();
        return Buffer.from(json.value, "base64");
    }
    async swipe(direction) {
        await this.withinSession(async (sessionUrl) => {
            const screenSize = await this.getScreenSize(sessionUrl);
            let x0, y0, x1, y1;
            // Use 60% of the width/height for swipe distance
            const verticalDistance = Math.floor(screenSize.height * 0.6);
            const horizontalDistance = Math.floor(screenSize.width * 0.6);
            const centerX = Math.floor(screenSize.width / 2);
            const centerY = Math.floor(screenSize.height / 2);
            switch (direction) {
                case "up":
                    x0 = x1 = centerX;
                    y0 = centerY + Math.floor(verticalDistance / 2);
                    y1 = centerY - Math.floor(verticalDistance / 2);
                    break;
                case "down":
                    x0 = x1 = centerX;
                    y0 = centerY - Math.floor(verticalDistance / 2);
                    y1 = centerY + Math.floor(verticalDistance / 2);
                    break;
                case "left":
                    y0 = y1 = centerY;
                    x0 = centerX + Math.floor(horizontalDistance / 2);
                    x1 = centerX - Math.floor(horizontalDistance / 2);
                    break;
                case "right":
                    y0 = y1 = centerY;
                    x0 = centerX - Math.floor(horizontalDistance / 2);
                    x1 = centerX + Math.floor(horizontalDistance / 2);
                    break;
                default:
                    throw new robot_1.ActionableError(`Swipe direction "${direction}" is not supported`);
            }
            const url = `${sessionUrl}/actions`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actions: [
                        {
                            type: "pointer",
                            id: "finger1",
                            parameters: { pointerType: "touch" },
                            actions: [
                                { type: "pointerMove", duration: 0, x: x0, y: y0 },
                                { type: "pointerDown", button: 0 },
                                { type: "pointerMove", duration: 1000, x: x1, y: y1 },
                                { type: "pointerUp", button: 0 }
                            ]
                        }
                    ]
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new robot_1.ActionableError(`WebDriver actions request failed: ${response.status} ${errorText}`);
            }
            // Clear actions to ensure they complete
            await fetch(`${sessionUrl}/actions`, {
                method: "DELETE",
            });
        });
    }
    async swipeFromCoordinate(x, y, direction, distance = 400) {
        await this.withinSession(async (sessionUrl) => {
            // Use simple coordinates like the working swipe method
            const x0 = x;
            const y0 = y;
            let x1 = x;
            let y1 = y;
            // Calculate target position based on direction and distance
            switch (direction) {
                case "up":
                    y1 = y - distance; // Move up by specified distance
                    break;
                case "down":
                    y1 = y + distance; // Move down by specified distance
                    break;
                case "left":
                    x1 = x - distance; // Move left by specified distance
                    break;
                case "right":
                    x1 = x + distance; // Move right by specified distance
                    break;
                default:
                    throw new robot_1.ActionableError(`Swipe direction "${direction}" is not supported`);
            }
            const url = `${sessionUrl}/actions`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    actions: [
                        {
                            type: "pointer",
                            id: "finger1",
                            parameters: { pointerType: "touch" },
                            actions: [
                                { type: "pointerMove", duration: 0, x: x0, y: y0 },
                                { type: "pointerDown", button: 0 },
                                { type: "pointerMove", duration: 1000, x: x1, y: y1 },
                                { type: "pointerUp", button: 0 }
                            ]
                        }
                    ]
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new robot_1.ActionableError(`WebDriver actions request failed: ${response.status} ${errorText}`);
            }
            // Clear actions to ensure they complete
            await fetch(`${sessionUrl}/actions`, {
                method: "DELETE",
            });
        });
    }
    async setOrientation(orientation) {
        await this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/orientation`;
            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orientation: orientation.toUpperCase()
                })
            });
        });
    }
    async getOrientation() {
        return this.withinSession(async (sessionUrl) => {
            const url = `${sessionUrl}/orientation`;
            const response = await fetch(url);
            const json = await response.json();
            return json.value.toLowerCase();
        });
    }
}
exports.WebDriverAgent = WebDriverAgent;

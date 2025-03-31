import { execSync } from "child_process";

export interface Simulator {
        name: string;
        uuid: string;
}

interface SourceTreeElement {
        type: string;
        label?: string;
        name?: string;
        rawIdentifier?: string;
        rect: {
                x: number;
                y: number;
                width: number;
                height: number;
        };

        children?: Array<SourceTreeElement>;
}

interface SourceTree {
        value: SourceTreeElement;
}

export const getConnectedDevices = (): Simulator[] => {
        return execSync(`xcrun simctl list devices`)
                .toString()
                .split("\n")
                .map(line => {
                        // extract device name and UUID from the line
                        const match = line.match(/(.*?)\s+\(([\w-]+)\)\s+\(Booted\)/);
                        if (!match) {
                                return null;
                        }

                        const deviceName = match[1].trim();
                        const deviceUuid = match[2];
                        return {
                                name: deviceName,
                                uuid: deviceUuid,
                        };
                })
                .filter(line => line !== null);
};

const simctl = (command: string): string => {
        return execSync(`xcrun simctl ${command}`).toString();
};

export const getScreenshot = (simulatorUuid: string): Buffer => {
        return execSync(`xcrun simctl io "${simulatorUuid}" screenshot -`, { maxBuffer: 1024 * 1024 * 10 });
};

export const openUrl = (simulatorUuid: string, url: string) => {
        return execSync(`xcrun simctl openurl "${simulatorUuid}" "${url}"`);
};

export const launchApp = (simulatorUuid: string, packageName: string) => {
        return simctl(`launch "${simulatorUuid}" "${packageName}"`);
};

export const listApps = (simulatorUuid: string) => {
        return simctl(`listapps "${simulatorUuid}"`);
};

const filterSourceElements = (source: SourceTreeElement): Array<any> => {

        const output: any[] = [];

        if (source.type === "TextField") {
                output.push({
                        type: "TextField",
                        label: source.label,
                        name: source.name,
                        coordinates: source.rect,
                });
        }

        if (source.children) {
                for (const child of source.children) {
                        output.push(...filterSourceElements(child));
                }
        }

        return output;
};

export const createSession = async (port: number) => {
        const url = `http://localhost:${port}/session`;
        const response = await fetch(url, {
                method: "POST",
                headers: {
                        "Content-Type": "application/json",
                },
                body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
        });

        const json = await response.json();
        return json.value.sessionId;
};

export const deleteSession = async (port: number, sessionId: string) => {
        const url = `http://localhost:${port}/session/${sessionId}`;
        const response = await fetch(url, { method: "DELETE" });
        return response.json();
};

const withinSession = async (port: number, fn: (sessionId: string) => Promise<any>) => {
        const sessionId = await createSession(port);
        await fn(sessionId);
        await deleteSession(port, sessionId);
};

export const getPageSource = async (port: number): Promise<SourceTree> => {
        const url = `http://192.168.0.205:${port}/source/?format=json`;
        const response = await fetch(url);
        const json = await response.json();
        return json as SourceTree;
};

export const sendKeys = async (port: number, keys: string) => {
        await withinSession(port, async (sessionId) => {
                const url = `http://localhost:${port}/session/${sessionId}/wda/keys`;
                const response = await fetch(url, {
                        method: "POST",
                        headers: {
                                "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ value: [keys] }),
                });

                return response.json();
        });
};

export const swipe = async (port: number, direction: "up" | "down" | "left" | "right") => {
        await withinSession(port, async (sessionId) => {

                const x0 = 200;
                const y0 = 600;
                const x1 = 200;
                const y1 = 200;

                const url = `http://localhost:${port}/session/${sessionId}/actions`;
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
                                                        { type: "pointerMove", duration: 0, x: x1, y: y1 },
                                                        { type: "pause", duration: 1000 },
                                                        { type: "pointerUp", button: 0 }
                                                ]
                                        }
                                ]
                        }),
                });

                return response.json();
        });
};

export const tap = async (port: number, x: number, y: number) => {
        await withinSession(port, async (sessionId) => {
                const url = `http://localhost:${port}/session/${sessionId}/actions`;
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
                                                        { type: "pointerMove", duration: 0, x, y },
                                                        { type: "pointerDown", button: 0 },
                                                        { type: "pause", duration: 100 },
                                                        { type: "pointerUp", button: 0 }
                                                ]
                                        }
                                ]
                        }),
                });

                return response.json();
        });
};

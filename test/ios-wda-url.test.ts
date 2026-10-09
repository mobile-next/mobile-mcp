import { test, expect } from "@playwright/test";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { IosRobot } from "../src/ios";

// minimal WebDriverAgent stand-in: just enough endpoints for getScreenSize() and getElementsOnScreen()
const startFakeWda = async (): Promise<{ server: Server; port: number; requests: string[] }> => {
	const requests: string[] = [];
	const server = createServer((req, res) => {
		requests.push(`${req.method} ${req.url}`);
		res.setHeader("Content-Type", "application/json");
		if (req.method === "GET" && req.url === "/status") {
			res.end(JSON.stringify({ value: { ready: true } }));
		} else if (req.method === "POST" && req.url === "/session") {
			res.end(JSON.stringify({ value: { sessionId: "fake-session" } }));
		} else if (req.method === "GET" && req.url === "/session/fake-session/wda/screen") {
			res.end(JSON.stringify({ value: { screenSize: { width: 390, height: 844 }, scale: 3 } }));
		} else if (req.method === "GET" && req.url === "/source?format=json") {
			res.end(JSON.stringify({ value: { type: "Application", isVisible: "1", label: null, name: null, rawIdentifier: null, rect: { x: 0, y: 0, width: 390, height: 844 }, children: [
				{ type: "Button", isVisible: "1", label: "Continue", name: "Continue", rawIdentifier: null, value: null, rect: { x: 20, y: 700, width: 350, height: 44 } },
			] } }));
		} else if (req.method === "DELETE" && req.url === "/session/fake-session") {
			res.end(JSON.stringify({ value: null }));
		} else {
			res.statusCode = 404;
			res.end(JSON.stringify({ value: { error: "unknown command" } }));
		}
	});

	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	return { server, port: (server.address() as AddressInfo).port, requests };
};

test.describe("ios MOBILEMCP_WDA_URL", () => {

	const savedEnv: Record<string, string | undefined> = {};

	test.beforeEach(() => {
		savedEnv.MOBILEMCP_WDA_URL = process.env.MOBILEMCP_WDA_URL;
		savedEnv.GO_IOS_PATH = process.env.GO_IOS_PATH;
		// any go-ios call (tunnel check) would fail loudly with this path
		process.env.GO_IOS_PATH = "/nonexistent/go-ios";
	});

	test.afterEach(() => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	test("should use the WDA URL and skip tunnel checks", async () => {
		const { server, port, requests } = await startFakeWda();
		try {
			process.env.MOBILEMCP_WDA_URL = `http://127.0.0.1:${port}`;
			const robot = new IosRobot("00000000-0000000000000000");
			const screenSize = await robot.getScreenSize();
			expect(screenSize).toEqual({ width: 390, height: 844, scale: 3 });
			expect(requests).toContain("GET /status");
		} finally {
			server.close();
		}
	});

	test("should list elements from /source without a trailing slash", async () => {
		const { server, port, requests } = await startFakeWda();
		try {
			process.env.MOBILEMCP_WDA_URL = `http://127.0.0.1:${port}`;
			const robot = new IosRobot("00000000-0000000000000000");
			const elements = await robot.getElementsOnScreen();
			expect(elements.map(e => e.label)).toEqual(["Continue"]);
			expect(requests).toContain("GET /source?format=json");
		} finally {
			server.close();
		}
	});

	test("should report an unreachable WDA URL", async () => {
		const { server, port } = await startFakeWda();
		server.close();
		process.env.MOBILEMCP_WDA_URL = `http://127.0.0.1:${port}`;
		const robot = new IosRobot("00000000-0000000000000000");
		await expect(robot.getScreenSize()).rejects.toThrow("WebDriverAgent is not reachable at MOBILEMCP_WDA_URL");
	});

	test("should reject an invalid WDA URL", async () => {
		process.env.MOBILEMCP_WDA_URL = "not a url";
		const robot = new IosRobot("00000000-0000000000000000");
		await expect(robot.getScreenSize()).rejects.toThrow("MOBILEMCP_WDA_URL is not a valid URL");
	});
});

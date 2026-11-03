import { test, expect } from "@playwright/test";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { WebDriverAgent } from "../src/webdriver-agent";

// a WDA stand-in that accepts requests but never answers them
const startSilentServer = async (): Promise<{ server: Server; port: number; open: () => number }> => {
	let open = 0;
	const server = createServer((req, res) => {
		open++;
		res.on("close", () => open--);
	});
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	return { server, port: (server.address() as AddressInfo).port, open: () => open };
};

test.describe("WebDriverAgent read timeouts", () => {

	test("getElementsOnScreen aborts the request when WDA does not answer", async () => {
		const { server, port, open } = await startSilentServer();
		try {
			const wda = new WebDriverAgent("127.0.0.1", port);
			const started = Date.now();
			await expect(wda.getElementsOnScreen(200)).rejects.toThrow();
			expect(Date.now() - started).toBeLessThan(3000);

			// the request itself was aborted, not just abandoned
			await expect.poll(open).toBe(0);
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});

	test("isRunning gives up on a WDA that does not answer", async () => {
		const { server, port } = await startSilentServer();
		try {
			const wda = new WebDriverAgent("127.0.0.1", port);
			const started = Date.now();
			expect(await wda.isRunning(200)).toBe(false);
			expect(Date.now() - started).toBeLessThan(3000);
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});
});

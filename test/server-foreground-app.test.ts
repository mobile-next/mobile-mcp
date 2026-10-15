import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";
import { Mobilecli } from "../src/mobilecli";

const ANDROID_DEVICE = "emulator-5554";

type ForegroundAppData = {
	packageName: string;
	appName?: string;
	activity?: string;
};

const originalExecuteCommand = Mobilecli.prototype.executeCommand;

// answers the mobilecli commands that mobile_get_foreground_app runs, as if one android emulator is attached
const pretendMobilecliReportsForegroundApp = (foreground: ForegroundAppData) => {
	Mobilecli.prototype.executeCommand = function(args: string[]): string {
		if (args[0] === "--version") {
			return "mobilecli version 1.0.18";
		}

		if (args[0] === "devices") {
			return JSON.stringify({ status: "ok", data: { devices: [{ id: ANDROID_DEVICE, name: "Pixel", platform: "android", type: "emulator", version: "15", state: "online" }] } });
		}

		if (args[0] === "apps" && args[1] === "foreground") {
			return JSON.stringify({ status: "ok", data: foreground });
		}

		throw new Error(`unexpected mobilecli command: ${args.join(" ")}`);
	};
};

const getForegroundAppText = async (): Promise<string> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "foreground-app-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	try {
		const result: any = await client.callTool({ name: "mobile_get_foreground_app", arguments: { device: ANDROID_DEVICE } });
		return result.content[0].text;
	} finally {
		await client.close();
	}
};

test.afterEach(() => {
	Mobilecli.prototype.executeCommand = originalExecuteCommand;
});

test("includes the focused activity when mobilecli reports one", async () => {
	pretendMobilecliReportsForegroundApp({ packageName: "com.android.settings", appName: "Settings", activity: "com.android.settings.SubSettings" });
	expect(await getForegroundAppText()).toBe("Foreground app: Settings (com.android.settings), activity: com.android.settings.SubSettings");
});

test("leaves out the activity when mobilecli does not report one", async () => {
	pretendMobilecliReportsForegroundApp({ packageName: "com.android.settings", appName: "Settings" });
	expect(await getForegroundAppText()).toBe("Foreground app: Settings (com.android.settings)");
});

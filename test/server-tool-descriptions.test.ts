import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/server";

interface ToolParameter {
	description?: string;
}

interface ToolDefinition {
	name: string;
	description?: string;
	inputSchema: {
		properties?: Record<string, ToolParameter>;
		required?: string[];
	};
}

const TOOLS_THAT_CANNOT_RUN_IN_A_BATCH = ["mobile_batch_commands", "mobile_take_screenshot"];

const listToolDefinitions = async (): Promise<ToolDefinition[]> => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "tool-descriptions-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	const result = await client.listTools();
	return result.tools as ToolDefinition[];
};

const findTool = (tools: ToolDefinition[], name: string): ToolDefinition => {
	const tool = tools.find(candidate => candidate.name === name);
	if (!tool) {
		throw new Error(`Tool ${name} is not registered`);
	}

	return tool;
};

const parameterNamesOf = (tool: ToolDefinition): string[] => Object.keys(tool.inputSchema.properties ?? {});

const requiredParametersOf = (tool: ToolDefinition): string[] => tool.inputSchema.required ?? [];

const everythingWrittenAbout = (tool: ToolDefinition): string => {
	const parameterDescriptions = Object.values(tool.inputSchema.properties ?? {}).map(parameter => parameter.description ?? "");
	return [tool.description ?? "", ...parameterDescriptions].join("\n");
};

const toolNamesMentionedIn = (text: string): string[] => text.match(/mobile_[a-z_]+/g) ?? [];

test("only mentions tools that exist", async () => {
	const tools = await listToolDefinitions();
	const registeredNames = tools.map(tool => tool.name);

	for (const tool of tools) {
		for (const mentionedName of toolNamesMentionedIn(everythingWrittenAbout(tool))) {
			expect(registeredNames, `${tool.name} mentions ${mentionedName}`).toContain(mentionedName);
		}
	}
});

test("names the app with packageName in every app tool", async () => {
	const tools = await listToolDefinitions();

	for (const name of ["mobile_launch_app", "mobile_terminate_app", "mobile_uninstall_app"]) {
		expect(requiredParametersOf(findTool(tools, name)), name).toEqual(["device", "packageName"]);
	}
});

test("lets mobile_type_keys be called without submit", async () => {
	const tools = await listToolDefinitions();
	const typeKeys = findTool(tools, "mobile_type_keys");

	expect(parameterNamesOf(typeKeys)).toContain("submit");
	expect(requiredParametersOf(typeKeys)).toEqual(["device", "text"]);
	expect(typeKeys.inputSchema.properties!.submit.description).toContain("Defaults to false");
});

test("lets every tap gesture target an element ref instead of coordinates", async () => {
	const tools = await listToolDefinitions();

	for (const name of ["mobile_click_on_screen_at_coordinates", "mobile_double_tap_on_screen", "mobile_long_press_on_screen_at_coordinates"]) {
		const gesture = findTool(tools, name);
		expect(parameterNamesOf(gesture), name).toContain("ref");
		expect(requiredParametersOf(gesture), name).toEqual(["device"]);
		expect(gesture.description, name).toContain("by its ref");
	}
});

test("tells which tools mobile_batch_commands can run", async () => {
	const tools = await listToolDefinitions();
	const batch = findTool(tools, "mobile_batch_commands");
	const batchableNames = tools.map(tool => tool.name).filter(name => !TOOLS_THAT_CANNOT_RUN_IN_A_BATCH.includes(name));

	expect(toolNamesMentionedIn(batch.description ?? "").sort()).toEqual(batchableNames.sort());
});

test("says mobile_open_url only opens http and https urls by default", async () => {
	const tools = await listToolDefinitions();
	const openUrl = findTool(tools, "mobile_open_url");

	expect(openUrl.description).toContain("http:// or https://");
	expect(openUrl.description).toContain("MOBILEMCP_ALLOW_UNSAFE_URLS=1");
});

// the buttons mobilecli accepts: AndroidDevice.PressButton and DeviceKitClient.PressButton
const ANDROID_BUTTONS = ["HOME", "BACK", "VOLUME_UP", "VOLUME_DOWN", "ENTER", "BACKSPACE", "APP_SWITCH", "POWER", "DPAD_CENTER", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"];
const IOS_BUTTONS = ["HOME", "VOLUME_UP", "VOLUME_DOWN", "ENTER", "LOCK"];

const buttonDescription = async (): Promise<string> => {
	const tools = await listToolDefinitions();
	return findTool(tools, "mobile_press_button").inputSchema.properties!.button.description ?? "";
};

const buttonsListedFor = (description: string, platform: string): string[] => {
	const line = description.split("\n").find(candidate => candidate.startsWith(`${platform}:`)) ?? "";
	return line.slice(platform.length + 1).split(",").map(name => name.trim()).filter(name => name !== "");
};

test("lists every button mobile_press_button accepts on android", async () => {
	expect(buttonsListedFor(await buttonDescription(), "Android").sort()).toEqual([...ANDROID_BUTTONS].sort());
});

test("lists every button mobile_press_button accepts on ios", async () => {
	expect(buttonsListedFor(await buttonDescription(), "iOS").sort()).toEqual([...IOS_BUTTONS].sort());
});

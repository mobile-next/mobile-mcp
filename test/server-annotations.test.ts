import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer } from "../src/server";

type ToolAnnotationMatrix = Record<string, ToolAnnotations>;

const expectedAnnotations: ToolAnnotationMatrix = {
	mobile_list_available_devices: { readOnlyHint: true, openWorldHint: false },
	mobile_login_to_cloud_provider: { openWorldHint: true },
	mobile_list_remote_devices: { readOnlyHint: true, openWorldHint: true },
	mobile_allocate_remote_device: { destructiveHint: false, openWorldHint: true },
	mobile_release_remote_device: { destructiveHint: true, openWorldHint: true },
	mobile_list_apps: { destructiveHint: false, openWorldHint: false },
	mobile_launch_app: { destructiveHint: true, openWorldHint: true },
	mobile_terminate_app: { destructiveHint: true, openWorldHint: false },
	mobile_install_app: { destructiveHint: true, openWorldHint: false },
	mobile_uninstall_app: { destructiveHint: true, openWorldHint: false },
	mobile_get_screen_size: { destructiveHint: false, openWorldHint: false },
	mobile_click_on_screen_at_coordinates: { destructiveHint: true, openWorldHint: true },
	mobile_double_tap_on_screen: { destructiveHint: true, openWorldHint: true },
	mobile_long_press_on_screen_at_coordinates: { destructiveHint: true, openWorldHint: true },
	mobile_list_elements_on_screen: { destructiveHint: false, openWorldHint: true },
	mobile_press_button: { destructiveHint: true, openWorldHint: true },
	mobile_open_url: { destructiveHint: true, openWorldHint: true },
	mobile_swipe_on_screen: { destructiveHint: true, openWorldHint: true },
	mobile_type_keys: { destructiveHint: true, openWorldHint: true },
	mobile_save_screenshot: { destructiveHint: true, openWorldHint: false },
	mobile_take_screenshot: { destructiveHint: false, openWorldHint: true },
	mobile_set_orientation: { destructiveHint: true, openWorldHint: false },
	mobile_get_orientation: { destructiveHint: false, openWorldHint: false },
	mobile_start_screen_recording: { destructiveHint: true, openWorldHint: false },
	mobile_stop_screen_recording: { destructiveHint: true, openWorldHint: false },
	mobile_list_crashes: { readOnlyHint: true, openWorldHint: true },
	mobile_get_crash: { readOnlyHint: true, openWorldHint: true },
};

test("describes every tool's side effects and interaction domain", async () => {
	const previousTelemetrySetting = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

	const server = createMcpServer();
	const client = new Client({ name: "tool-annotations-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.listTools();
		const actualAnnotations = Object.fromEntries(result.tools.map(tool => [tool.name, tool.annotations]));

		expect(actualAnnotations).toEqual(expectedAnnotations);
	} finally {
		await client.close();
		await server.close();

		if (previousTelemetrySetting === undefined) {
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		} else {
			process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetrySetting;
		}
	}
});

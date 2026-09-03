import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer } from "../src/server";

type ToolAnnotationMatrix = Record<string, ToolAnnotations>;

const expectedAnnotations: ToolAnnotationMatrix = {
	mobile_list_available_devices: { readOnlyHint: true, openWorldHint: false },
	mobile_login_to_cloud_provider: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_list_remote_devices: { readOnlyHint: true, openWorldHint: true },
	mobile_allocate_remote_device: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_release_remote_device: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
	mobile_list_apps: { readOnlyHint: true, openWorldHint: false },
	mobile_get_foreground_app: { readOnlyHint: true, openWorldHint: false },
	mobile_launch_app: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_terminate_app: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_install_app: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_uninstall_app: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
	mobile_get_screen_size: { readOnlyHint: true, openWorldHint: false },
	mobile_click_on_screen_at_coordinates: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_double_tap_on_screen: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_long_press_on_screen_at_coordinates: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_list_elements_on_screen: { readOnlyHint: true, openWorldHint: true },
	mobile_press_button: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_open_url: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_swipe_on_screen: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_type_keys: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	mobile_save_screenshot: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_take_screenshot: { readOnlyHint: true, openWorldHint: true },
	mobile_set_orientation: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_get_orientation: { readOnlyHint: true, openWorldHint: false },
	mobile_start_screen_recording: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_stop_screen_recording: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
	mobile_list_crashes: { readOnlyHint: true, openWorldHint: true },
	mobile_get_crash: { readOnlyHint: true, openWorldHint: true },
};

test("describes every tool's side effects and interaction domain", async () => {
	const previousTelemetrySetting = process.env.MOBILEMCP_DISABLE_TELEMETRY;
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";

	try {
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
		}
	} finally {
		if (previousTelemetrySetting === undefined) {
			delete process.env.MOBILEMCP_DISABLE_TELEMETRY;
		} else {
			process.env.MOBILEMCP_DISABLE_TELEMETRY = previousTelemetrySetting;
		}
	}
});

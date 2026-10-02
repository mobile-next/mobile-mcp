import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Shot, Target } from "../types";
import { keysToActions } from "./keys";
import { fitInside, pngSize } from "./png";

// the key of the MCP server in this plugin's manifest
const MCP_SERVER = "mobile-mcp";
const COMMAND = "mobile-mirror";
const PANE = "mobile-mirror";
const VIEW_KEY = "view";
const TAP_KEY = "tap";
// frames rotate through a few files, so the terminal never reads one being rewritten
const FRAME_FILES = 3;
// large enough that the terminal never upscales it on a Retina pane; smaller is faster
const SHOT_MAX_SIZE = 1600;
const RETRY_AFTER_ERROR_MS = 1000;
// the toolbar row, plus the URL field's row while it shows
const TOOLBAR_ROWS = 1;
const URL_FIELD_ROWS = 1;

// kept in session state, not module variables, so they survive a reload of the mod
const target = atom({ plugin: "mobile-mcp", key: "target" } as const, null as Target | null);
// bumped to stop the running frame loop: a loop runs only while it holds the current value
const streamId = atom({ plugin: "mobile-mcp", key: "streamId" } as const, 0);
const isAskingUrl = atom({ plugin: "mobile-mcp", key: "isAskingUrl" } as const, false);
const shot = atom({ plugin: "mobile-mcp", key: "shot" } as const, { file: "", generation: 0, width: 1, height: 1 } as Shot);

type Device = { id: string; platform: string; state: string };
type TapMessage = { x: number; y: number };
type KeysMessage = { keys: string[] };
// the runtime has Uint8Array.fromBase64; the TS lib does not declare it yet
type Base64Decoder = { fromBase64(base64: string): Uint8Array };
type McpResult = Awaited<ReturnType<EngineInterface["mcp"]["call"]>>;

function firstText(content: unknown): string {
	const block = (content as { type: string; text?: string }[]).find(b => b.type === "text");

	return block?.text ?? "";
}

function frameFile(generation: number): string {
	return `/tmp/mobile-mirror-${generation % FRAME_FILES}.png`;
}

// calls a mobile-mcp tool by the name this session runs the server under, connecting it on first use
async function callMobileMcp($: EngineInterface, tool: string, args: Record<string, unknown> = {}): Promise<McpResult> {
	const connection = await $.mcp.connect(MCP_SERVER);
	if (!connection.isConnected) {
		throw new Error(`mobile-mcp is not connected: ${connection.message}`);
	}

	return $.mcp.call(connection.server, tool, args);
}

// runs a toolbar action, and toasts only when it fails
async function runAction($: EngineInterface, what: string, tool: string, args: Record<string, unknown>): Promise<void> {
	try {
		const result = await callMobileMcp($, tool, args);
		if (result.isError) {
			$.ui.toast(`${what} failed: ${firstText(result.content)}`);
		}

	} catch (error) {
		$.ui.toast(`${what} failed: ${String(error)}`);
	}
}

function pickDevice(devices: Device[], wanted: string | undefined): Device | undefined {
	const online = devices.filter(d => d.state === "online");
	if (wanted) {
		return online.find(d => d.id === wanted);
	}

	return online.find(d => d.platform === "android") ?? online[0];
}

export const register: Register = on => {
	// key batches are sent one after another, so typed text keeps its order
	let typing: Promise<void> = Promise.resolve();

	on("session.start", async ($, e, next) => {
		await $.command.register({ name: COMMAND, description: "Mirror a device screen: live picture, taps, keys and buttons", argumentHint: "[device-id]" });

		return next(e);
	});

	on("command.run", { command: COMMAND }, async ($, e) => {
		const wanted = e.args.trim() || undefined;
		const listed = await callMobileMcp($, "mobile_list_available_devices");
		const { devices } = JSON.parse(firstText(listed.content)) as { devices: Device[] };
		const device = pickDevice(devices, wanted);
		if (!device) {
			const online = devices.filter(d => d.state === "online").map(d => d.id);
			return { text: `No online device${wanted ? ` "${wanted}"` : ""}. Online: ${online.join(", ") || "none"}` };
		}

		const sized = await callMobileMcp($, "mobile_get_screen_size", { device: device.id });
		const match = /(\d+)x(\d+)/.exec(firstText(sized.content));
		if (!match) {
			return { text: `Could not read the screen size of ${device.id}.` };
		}

		await update($, target, () => ({
			id: device.id,
			platform: device.platform === "android" ? "android" : "ios",
			screenWidth: Number(match[1]),
			screenHeight: Number(match[2]),
		}));
		await update($, isAskingUrl, () => false);
		await update($, streamId, n => n + 1);
		const id = await read($, streamId);

		const captureFrame = async (generation: number): Promise<boolean> => {
			const file = frameFile(generation);
			const saved = await callMobileMcp($, "mobile_save_screenshot", { device: device.id, saveTo: file, maxSize: SHOT_MAX_SIZE });
			if (saved.isError) {
				return false;
			}

			const { base64 } = await $.fs.read(file, { as: "bytes" });
			const size = pngSize((Uint8Array as unknown as Base64Decoder).fromBase64(base64));
			const current = await read($, shot);
			// a new shape (first frame, rotation) needs a full redraw; otherwise swap the pixels in place
			if (current.generation === 0 || current.width !== size.width || current.height !== size.height) {
				await update($, shot, () => ({ file, generation, ...size }));
			} else {
				await $.ui.blit({ requestId: PANE, key: VIEW_KEY, source: { file, format: "png", generation } }).catch(() => {});
			}

			return true;
		};

		const stream = async () => {
			// the next frame is asked for as soon as the previous one is shown
			for (let generation = 1; id === (await read($, streamId)); generation++) {
				const isShown = await captureFrame(generation).catch(() => false);
				if (!isShown) {
					await $.clock.sleep(RETRY_AFTER_ERROR_MS);
				}

			}
		};

		await update($, shot, () => ({ file: "", generation: 0, width: 1, height: 1 }));
		void stream();
		await $.ui.open({ id: PANE, title: `mobile-mirror · ${device.id}` });

		return { text: `Mirroring ${device.id}. Click the picture to tap, then type to send keys.` };
	});

	on("ui.message", async ($, e) => {
		const device = await read($, target);
		if (e.element !== TAP_KEY || !device) {
			return {};
		}

		if ("keys" in (e.data as object)) {
			const actions = keysToActions((e.data as KeysMessage).keys, device.platform);
			typing = typing.then(async () => {
				for (const action of actions) {
					if (action.type === "text") {
						await runAction($, "Typing", "mobile_type_keys", { device: device.id, text: action.text, submit: false });
					} else {
						await runAction($, `Press ${action.button}`, "mobile_press_button", { device: device.id, button: action.button });
					}

				}
			});

			return {};
		}

		const tap = e.data as TapMessage;
		const x = Math.round(tap.x * device.screenWidth);
		const y = Math.round(tap.y * device.screenHeight);
		await runAction($, "Tap", "mobile_click_on_screen_at_coordinates", { device: device.id, x, y });

		return {};
	});

	on("ui.close", async ($, e, next) => {
		if (e.id === PANE) {
			await update($, streamId, n => n + 1);
		}

		return next(e);
	});

	on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
		const ui = $.ui.resolve(e);
		const { Box, Text } = ui;
		if (e.surface !== "terminal" || !("Image" in ui)) {
			return <Text>mobile-mirror needs the terminal, in kitty or Ghostty.</Text>;
		}

		const { file, generation, width, height } = await read($, shot);
		if (generation === 0) {
			return <Text dimColor>Waiting for the first frame…</Text>;
		}

		const device = await read($, target);
		if (!device) {
			return <Text dimColor>Run /mobile-mirror to pick a device.</Text>;
		}

		const isAndroid = device.platform === "android";
		const isAsking = await read($, isAskingUrl);
		const roomForImage = e.props.scroll.bodyRows - TOOLBAR_ROWS - (isAsking ? URL_FIELD_ROWS : 0);
		const size = fitInside(e.props.bodyColumns, roomForImage, width, height);
		const { Button, Input } = ui;

		const press = (button: string) => () => runAction($, `Press ${button}`, "mobile_press_button", { device: device.id, button });

		const openUrl = async (url: string) => {
			await update($, isAskingUrl, () => false);
			if (!url.trim()) {
				return;
			}

			await runAction($, `Open ${url.trim()}`, "mobile_open_url", { device: device.id, url: url.trim() });
		};

		return (
			<Box flexDirection='column'>
				<Box flexDirection='row' gap={1}>
					<Button key='home' label='Home' onPress={press("HOME")} />
					{isAndroid && <Button key='back' label='Back' onPress={press("BACK")} />}
					{isAndroid && <Button key='app-switch' label='App Switch' onPress={press("APP_SWITCH")} />}
					<Button key='url' label='URL' onPress={() => update($, isAskingUrl, asking => !asking)} />
				</Box>
				{isAsking && <Input key='url-field' label='URL ' placeholder='https://example.com' submitLabel='open' autoFocus onSubmit={openUrl} />}
				<Box>
					<ui.Image key={VIEW_KEY} source={{ file, format: "png", generation }} columns={size.columns} rows={size.rows} alt='device screen' />
					<Box position='absolute' top={0} left={0}>
						<ui.Client key={TAP_KEY} module='./tap.tsx' width={size.columns} height={size.rows} />
					</Box>
				</Box>
			</Box>
		);
	});
};

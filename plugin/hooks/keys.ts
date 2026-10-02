import type { Platform } from "../types";

export type KeyAction = { type: "text"; text: string } | { type: "button"; button: string };

// special key names the terminal reports, mapped to mobile_press_button buttons
const ANDROID_BUTTONS: Record<string, string> = {
	return: "ENTER",
	backspace: "BACKSPACE",
	delete: "BACKSPACE",
	up: "DPAD_UP",
	down: "DPAD_DOWN",
	left: "DPAD_LEFT",
	right: "DPAD_RIGHT",
};

const IOS_BUTTONS: Record<string, string> = {
	return: "ENTER",
};

// ponytail: iOS has no BACKSPACE button in mobilecli, so it is typed as \b; unverified on a device
const IOS_TEXT: Record<string, string> = {
	backspace: "\b",
	delete: "\b",
};

function actionFor(key: string, platform: Platform): KeyAction | undefined {
	const buttons = platform === "android" ? ANDROID_BUTTONS : IOS_BUTTONS;
	const button = buttons[key];
	if (button) {
		return { type: "button", button };
	}

	const text = platform === "ios" ? IOS_TEXT[key] : undefined;
	if (text) {
		return { type: "text", text };
	}

	if (key === "space") {
		return { type: "text", text: " " };
	}

	// a single character is typed as is; any other named key is dropped
	if ([...key].length === 1) {
		return { type: "text", text: key };
	}

	return undefined;
}

// turns pressed keys into device actions, joining consecutive text into one type call
export function keysToActions(keys: string[], platform: Platform): KeyAction[] {
	const actions: KeyAction[] = [];
	for (const key of keys) {
		const action = actionFor(key, platform);
		if (!action) {
			continue;
		}

		const last = actions[actions.length - 1];
		if (action.type === "text" && last?.type === "text") {
			actions[actions.length - 1] = { type: "text", text: last.text + action.text };
		} else {
			actions.push(action);
		}

	}

	return actions;
}

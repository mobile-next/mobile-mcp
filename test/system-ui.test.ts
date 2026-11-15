import { expect, test } from "@playwright/test";

import { dropPassiveOverlays, inferWindowPackage, UINode } from "../src/system-ui";

// shapes taken from a real "dump ui" of a samsung galaxy s25 ultra (1080x2340)
// with the settings app in the foreground

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const gestureHandle: UINode = {
	identifier: "com.samsung.android.sidegesturepad:id/visible_handler",
	rect: rect(1033, 96, 47, 2148),
	children: [{ identifier: "com.samsung.android.sidegesturepad:id/visible_area", rect: rect(1069, 96, 11, 2148) }],
};

const edgePanelTrigger: UINode = {
	rect: rect(0, 267, 80, 266),
	children: [{
		identifier: "android:id/content",
		rect: rect(0, 267, 80, 266),
		children: [
			{ identifier: "com.sec.android.app.launcher:id/root_container", rect: rect(0, 267, 80, 266) },
			{ identifier: "com.sec.android.app.launcher:id/trigger_view", rect: rect(0, 267, 15, 266) },
		],
	}],
};

const statusBar: UINode = {
	identifier: "com.android.systemui:id/status_bar_launch_animation_container",
	rect: rect(0, 0, 1080, 96),
	children: [
		{ identifier: "com.android.systemui:id/status_bar", rect: rect(0, 0, 1080, 96) },
		{ identifier: "com.android.systemui:id/clock", rect: rect(36, 17, 284, 67) },
		{ identifier: "com.android.systemui:id/battery", rect: rect(969, 17, 79, 68) },
	],
};

const settingsWindow: UINode = {
	identifier: "com.android.settings:id/action_bar_root",
	rect: rect(0, 0, 1080, 2340),
	children: [
		{ identifier: "android:id/content", rect: rect(0, 0, 1080, 2340) },
		{ identifier: "com.android.settings:id/recycler_view", rect: rect(0, 264, 1080, 2076) },
		{ identifier: "android:id/title", rect: rect(210, 406, 175, 49) },
	],
};

test("drops status bar, gesture handles and edge trigger around a foreground app", () => {
	const kept = dropPassiveOverlays([gestureHandle, gestureHandle, edgePanelTrigger, statusBar, settingsWindow]);
	expect(kept).toEqual([settingsWindow]);
});

test("keeps the notification shade although it is drawn by systemui", () => {
	const shade: UINode = {
		identifier: "com.android.systemui:id/notification_panel",
		rect: rect(0, 0, 1080, 2340),
		children: [{ identifier: "com.android.systemui:id/quick_settings_container", rect: rect(0, 96, 1080, 800) }],
	};

	const kept = dropPassiveOverlays([statusBar, shade, settingsWindow]);
	expect(kept).toEqual([shade, settingsWindow]);
});

test("keeps the home screen although the launcher also draws the edge trigger", () => {
	const homeScreen: UINode = {
		identifier: "com.sec.android.app.launcher:id/workspace",
		rect: rect(0, 0, 1080, 2340),
		children: [{ identifier: "com.sec.android.app.launcher:id/hotseat", rect: rect(0, 2000, 1080, 300) }],
	};

	const kept = dropPassiveOverlays([statusBar, edgePanelTrigger, homeScreen]);
	expect(kept).toEqual([homeScreen]);
});

test("keeps windows of unknown packages, such as the keyboard and permission dialogs", () => {
	const keyboard: UINode = {
		identifier: "com.google.android.inputmethod.latin:id/keyboard_area",
		rect: rect(0, 1500, 1080, 840),
	};
	const permissionDialog: UINode = {
		identifier: "com.google.android.permissioncontroller:id/grant_dialog",
		rect: rect(60, 900, 960, 500),
	};

	const kept = dropPassiveOverlays([statusBar, keyboard, permissionDialog, settingsWindow]);
	expect(kept).toEqual([keyboard, permissionDialog, settingsWindow]);
});

test("keeps the status bar while it carries a tappable chip, such as an ongoing call", () => {
	const callChip: UINode = { identifier: "com.android.systemui:id/ongoing_call_chip", rect: rect(340, 17, 160, 68) };
	const statusBarWithCall: UINode = { ...statusBar, children: [...statusBar.children!, callChip] };
	const statusBarWithActivityChip: UINode = {
		...statusBar,
		children: [...statusBar.children!, { identifier: "com.android.systemui:id/ongoing_activity_chip_primary", rect: rect(340, 17, 160, 68) }],
	};

	expect(dropPassiveOverlays([statusBarWithCall, settingsWindow])).toEqual([statusBarWithCall, settingsWindow]);
	expect(dropPassiveOverlays([statusBarWithActivityChip, settingsWindow])).toEqual([statusBarWithActivityChip, settingsWindow]);
});

test("keeps a small systemui window that is not the status bar, such as the volume dialog", () => {
	const volumeDialog: UINode = {
		identifier: "com.android.systemui:id/volume_dialog",
		rect: rect(960, 600, 100, 700),
		children: [{ identifier: "com.android.systemui:id/volume_row_slider", rect: rect(980, 640, 60, 600) }],
	};

	const kept = dropPassiveOverlays([statusBar, volumeDialog, settingsWindow]);
	expect(kept).toEqual([volumeDialog, settingsWindow]);
});

test("keeps the one hand operation + settings screen next to its own gesture handles", () => {
	const oneHandSettings: UINode = {
		identifier: "com.samsung.android.sidegesturepad:id/settings_container",
		rect: rect(0, 0, 1080, 2340),
		children: [{ identifier: "com.samsung.android.sidegesturepad:id/main_switch", rect: rect(40, 300, 1000, 120) }],
	};
	const keyboard: UINode = {
		identifier: "com.google.android.inputmethod.latin:id/keyboard_area",
		rect: rect(0, 1500, 1080, 840),
	};

	const kept = dropPassiveOverlays([gestureHandle, oneHandSettings, keyboard]);
	expect(kept).toEqual([oneHandSettings, keyboard]);
});

test("keeps windows that carry no package, as on ios", () => {
	const iosWindow: UINode = {
		identifier: "main window",
		rect: rect(0, 0, 390, 844),
		children: [{ identifier: "Login", rect: rect(20, 400, 350, 44) }],
	};

	expect(dropPassiveOverlays([iosWindow])).toEqual([iosWindow]);
});

test("shows something rather than nothing when only overlays are on screen", () => {
	// with no app window the largest overlay stands in for the screen and is kept
	expect(dropPassiveOverlays([statusBar, gestureHandle])).toEqual([statusBar]);
	expect(dropPassiveOverlays([gestureHandle])).toEqual([gestureHandle]);
	expect(dropPassiveOverlays([])).toEqual([]);
});

test("infers a window's package from its most common resource id, ignoring framework ids", () => {
	expect(inferWindowPackage(edgePanelTrigger)).toBe("com.sec.android.app.launcher");
	expect(inferWindowPackage(settingsWindow)).toBe("com.android.settings");
	expect(inferWindowPackage({ identifier: "android:id/content", rect: rect(0, 0, 10, 10) })).toBeUndefined();
	expect(inferWindowPackage({ rect: rect(0, 0, 10, 10) })).toBeUndefined();
});

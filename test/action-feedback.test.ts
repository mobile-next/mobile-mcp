import { expect, test } from "@playwright/test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import {
	buildReport,
	classifyChange,
	DEFAULT_FEEDBACK_SETTINGS,
	diffElements,
	elementAt,
	feedbackSettingsFromEnv,
	formatReport,
	FeedbackRobot,
	runWithFeedback,
	SettleClock,
	waitForSettle,
} from "../src/action-feedback";
import { ForegroundApp, ScreenElement } from "../src/robot";
import { createMcpServer } from "../src/server";

const element = (type: string, x: number, y: number, width: number, height: number, extra: Partial<ScreenElement> = {}): ScreenElement => ({
	type,
	rect: { x, y, width, height },
	...extra,
});

// a sign-up form on a 1080x2400 android screen
const title = element("android.widget.TextView", 48, 120, 984, 80, { ref: "@e1", text: "Create account" });
const emailField = element("android.widget.EditText", 48, 300, 984, 140, { ref: "@e2", text: "Email", identifier: "email" });
const termsBox = element("android.widget.CheckBox", 48, 500, 984, 120, { ref: "@e3", text: "I accept the terms" });
const doneButton = element("android.widget.Button", 48, 2100, 984, 160, { ref: "@e4", text: "Done" });
const form = [title, emailField, termsBox, doneButton];

const fakeClock = (): SettleClock & { slept: number } => {
	let now = 0;
	return {
		get slept() {
			return now;
		},
		now: () => now,
		sleep: async (ms: number) => {
			now += ms;
		},
	};
};

const reader = (snapshots: ScreenElement[][]) => {
	let reads = 0;
	const read = async (): Promise<ScreenElement[]> => snapshots[Math.min(reads++, snapshots.length - 1)];
	return { read, reads: () => reads };
};

test.describe("waitForSettle", () => {

	test("returns as soon as two consecutive snapshots match", async () => {
		const loading = [title, element("android.widget.ProgressBar", 500, 1000, 80, 80)];
		const { read, reads } = reader([loading, form, form, form]);

		const result = await waitForSettle(read, DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(result.settled).toBe(true);
		expect(result.elements).toBe(form);
		expect(reads()).toBe(3);
		expect(result.elapsedMs).toBe(750);
	});

	test("gives up after the timeout when the screen keeps changing", async () => {
		const frames = Array.from({ length: 50 }, (_, i) => [element("android.widget.TextView", 0, 0, 100, 50, { text: `frame ${i}` })]);
		const { read } = reader(frames);

		const result = await waitForSettle(read, { timeoutMs: 1000, intervalMs: 250 }, fakeClock());

		expect(result.settled).toBe(false);
		expect(result.elapsedMs).toBeGreaterThanOrEqual(1000);
		expect(result.elapsedMs).toBeLessThan(1500);
	});

	test("treats renumbered refs as the same screen", async () => {
		const renumbered = form.map((e, i) => ({ ...e, ref: `@e${i + 10}` }));
		const { read, reads } = reader([form, renumbered]);

		const result = await waitForSettle(read, DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(result.settled).toBe(true);
		expect(reads()).toBe(2);
	});
});

test.describe("diffElements", () => {

	test("matches a field whose text changed instead of reporting it removed and added", () => {
		const typed = { ...emailField, text: "me@example.com" };
		const diff = diffElements(form, [title, typed, termsBox, doneButton]);

		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.changed.length).toBe(1);
		expect(diff.changed[0].after).toBe(typed);
		expect(diff.changed[0].fields).toEqual(["text"]);
	});

	test("reports a checkbox that became checked", () => {
		const diff = diffElements(form, [title, emailField, { ...termsBox, checked: true }, doneButton]);

		expect(diff.changed.map(change => change.fields)).toEqual([["checked"]]);
	});
});

test.describe("classifyChange", () => {

	const classify = (before: ScreenElement[], after: ScreenElement[], beforeApp?: ForegroundApp, afterApp?: ForegroundApp) =>
		classifyChange(before, after, diffElements(before, after), beforeApp, afterApp);

	test("nothing changed", () => {
		expect(classify(form, form.map(e => ({ ...e }))).change).toBe("none");
	});

	test("a state change is a content change", () => {
		expect(classify(form, [title, emailField, { ...termsBox, checked: true }, doneButton]).change).toBe("content_changed");
	});

	test("a new activity is a new screen, even with similar elements", () => {
		const signup = { packageName: "com.example", appName: "Example", activity: ".SignupActivity" };
		const home = { ...signup, activity: ".HomeActivity" };
		expect(classify(form, form, signup, home).change).toBe("new_screen");
	});

	test("most elements replaced across the whole screen is a new screen", () => {
		const home = [
			element("android.widget.TextView", 48, 120, 984, 80, { text: "Welcome" }),
			element("android.widget.ImageView", 0, 300, 1080, 1200, { label: "banner" }),
			element("android.widget.Button", 48, 2100, 984, 160, { text: "Continue" }),
		];
		expect(classify(form, home).change).toBe("new_screen");
	});

	test("an alert added on top of the screen is a dialog", () => {
		const alert = element("XCUIElementTypeAlert", 40, 300, 310, 200, { label: "Allow notifications?" });
		expect(classify(form, [...form, alert]).change).toBe("dialog_opened");
		expect(classify([...form, alert], form).change).toBe("dialog_closed");
	});

	test("a small window replacing the screen is a dialog", () => {
		// uiautomator only dumps the dialog window, so the screen behind it disappears from the list
		const dialog = [
			element("android.widget.TextView", 140, 1000, 800, 80, { text: "Discard changes?" }),
			element("android.widget.Button", 600, 1200, 200, 100, { text: "Discard" }),
			element("android.widget.Button", 340, 1200, 200, 100, { text: "Keep" }),
		];
		expect(classify(form, dialog).change).toBe("dialog_opened");
		expect(classify(dialog, form).change).toBe("dialog_closed");
	});

	test("elements shifting together is a scroll, with the offset", () => {
		const rows = Array.from({ length: 8 }, (_, i) => element("android.widget.TextView", 0, 200 + i * 200, 1080, 200, { text: `Row ${i}` }));
		const toolbar = element("android.widget.TextView", 0, 0, 1080, 200, { text: "Inbox" });
		const scrolled = rows.slice(3).map(row => ({ ...row, rect: { ...row.rect, y: row.rect.y - 600 } }));
		const entered = Array.from({ length: 3 }, (_, i) => element("android.widget.TextView", 0, 1200 + i * 200, 1080, 200, { text: `Row ${i + 8}` }));

		const result = classify([toolbar, ...rows], [toolbar, ...scrolled, ...entered]);

		expect(result.change).toBe("scrolled");
		expect(result.scroll).toEqual({ dx: 0, dy: -600 });
	});
});

test.describe("elementAt", () => {

	test("picks the topmost described element under the point", () => {
		const container = element("android.widget.FrameLayout", 0, 0, 1080, 2400);
		const icon = element("android.widget.ImageView", 100, 2120, 40, 40);
		expect(elementAt([container, doneButton, icon], 120, 2140)).toBe(doneButton);
	});

	test("returns nothing where there is no element", () => {
		expect(elementAt(form, 1070, 1500)).toBeUndefined();
	});
});

test.describe("buildReport and formatReport", () => {

	const settled = { settled: true, elapsedMs: 500 };

	test("a dead button reports that nothing changed and what was touched", () => {
		const report = buildReport({ kind: "point", x: 540, y: 2180 }, { elements: form }, { elements: form }, settled);
		const text = formatReport(report);

		expect(report.change).toBe("none");
		expect(text).toBe([
			"Screen: no change, the action had no visible effect (settled in 500ms)",
			"Touch: Button text=\"Done\" at=48,2100 size=984x160",
		].join("\n"));
	});

	test("a tap by ref reports an element covering the aimed one", () => {
		const banner = element("android.widget.TextView", 0, 2050, 1080, 300, { ref: "@e9", text: "Rate our app!" });
		const report = buildReport({ kind: "ref", ref: "@e4" }, { elements: [...form, banner] }, { elements: [...form, banner] }, settled);

		expect(formatReport(report)).toContain("Touch: landed on TextView text=\"Rate our app!\" at=0,2050 size=1080x300, which covers the aimed Button \"Done\"");
	});

	test("a tap by ref on a button with its own label inside does not report a miss", () => {
		const label = element("android.widget.TextView", 400, 2150, 280, 60, { ref: "@e5", text: "Done" });
		const report = buildReport({ kind: "ref", ref: "@e4" }, { elements: [...form, label] }, { elements: [...form, label] }, settled);

		expect(report.touch).toBeUndefined();
	});

	test("a tap by ref on a disabled button says it is disabled", () => {
		const disabled = { ...doneButton, enabled: false };
		const screen = [title, emailField, termsBox, disabled];
		const text = formatReport(buildReport({ kind: "ref", ref: "@e4" }, { elements: screen }, { elements: screen }, settled));

		expect(text).toContain("Touch: Button text=\"Done\" at=48,2100 size=984x160 disabled");
	});

	test("typing flags a dropped character", () => {
		const after = [title, { ...emailField, text: "e@example.com", focused: true }, termsBox, doneButton];
		const text = formatReport(buildReport({ kind: "typing", text: "me@example.com" }, { elements: form }, { elements: after }, settled));

		expect(text).toContain("Field: @e2 EditText \"email\" value=\"e@example.com\" MISMATCH, typed \"me@example.com\"");
	});

	test("typing reports the field value when it matches, even without focus info", () => {
		const after = [title, { ...emailField, text: "me@example.com" }, termsBox, doneButton];
		const text = formatReport(buildReport({ kind: "typing", text: "me@example.com" }, { elements: form }, { elements: after }, settled));

		expect(text).toContain("Field: @e2 EditText \"email\" value=\"me@example.com\"");
		expect(text).not.toContain("MISMATCH");
		expect(text).toContain("~ @e2 EditText \"email\": text \"Email\" -> \"me@example.com\"");
	});

	test("typing into a secure field does not compare the masked value", () => {
		const password = element("XCUIElementTypeSecureTextField", 20, 300, 350, 44, { ref: "@e7", label: "Password", focused: true });
		const after = [{ ...password, value: "••••••" }];
		const report = buildReport({ kind: "typing", text: "secret" }, { elements: [password] }, { elements: after }, settled);

		expect(report.typing?.status).toBe("hidden");
	});

	test("caps the diff and points to the full list", () => {
		const rows = Array.from({ length: 20 }, (_, i) => element("android.widget.TextView", 0, i * 100, 1080, 100, { text: `Result ${i}` }));
		const text = formatReport(buildReport({ kind: "none" }, { elements: [title] }, { elements: [title, ...rows] }, settled), 5);
		const lines = text.split("\n");

		expect(lines).toContain("Changes: 20 added, 0 removed, 0 changed");
		expect(lines.filter(line => line.startsWith("+ ")).length).toBe(5);
		expect(lines[lines.length - 1]).toBe("... and 15 more, call mobile_list_elements_on_screen for the full list");
	});

	test("a scroll leaves plain moves out of the diff", () => {
		const rows = Array.from({ length: 6 }, (_, i) => element("android.widget.TextView", 0, i * 300, 1080, 300, { ref: `@e${i}`, text: `Row ${i}` }));
		const moved = rows.slice(2).map(row => ({ ...row, rect: { ...row.rect, y: row.rect.y - 600 } }));
		const text = formatReport(buildReport({ kind: "none" }, { elements: rows }, { elements: moved }, settled));

		expect(text).toContain("Screen: scrolled, content moved up by 600px (settled in 500ms)");
		expect(text).toContain("Changes: 0 added, 2 removed, 0 changed");
		expect(text).not.toContain("~ ");
	});
});

test.describe("runWithFeedback", () => {

	const robotWith = (snapshots: ScreenElement[][], apps: ForegroundApp[] = []): FeedbackRobot & { reads: () => number } => {
		let reads = 0;
		let appReads = 0;
		return {
			reads: () => reads,
			getElementsOnScreen: async () => snapshots[Math.min(reads++, snapshots.length - 1)],
			getForegroundApp: apps.length === 0 ? undefined : async () => apps[Math.min(appReads++, apps.length - 1)],
		};
	};

	test("keeps the action's own result as the first line", async () => {
		const robot = robotWith([form, [...form, element("XCUIElementTypeSheet", 0, 1600, 1080, 800, { ref: "@e8", label: "Choose a photo" })]]);

		const text = await runWithFeedback(robot, { kind: "ref", ref: "@e4" }, async () => "Clicked on element @e4", DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(text.split("\n")[0]).toBe("Clicked on element @e4");
		expect(text).toContain("Screen: a dialog or sheet appeared");
		expect(text).toContain("+ @e8 XCUIElementTypeSheet label=\"Choose a photo\"");
	});

	test("names the new foreground app", async () => {
		const settings = { packageName: "com.android.settings", appName: "Settings", activity: ".Settings" };
		const browser = { packageName: "com.android.chrome", appName: "Chrome" };
		const robot = robotWith([form], [settings, browser]);

		const text = await runWithFeedback(robot, { kind: "none" }, async () => "Opened URL: https://example.com", DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(text).toContain("Screen: new screen, foreground app com.android.chrome");
	});

	test("returns only the action's result when the screen cannot be read before the action", async () => {
		const robot: FeedbackRobot = { getElementsOnScreen: async () => {
			throw new Error("screen is off");
		} };
		let ran = false;

		const text = await runWithFeedback(robot, { kind: "none" }, async () => {
			ran = true;
			return "Pressed the button: POWER";
		}, DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(ran).toBe(true);
		expect(text).toBe("Pressed the button: POWER");
	});

	test("does not fail the action when the screen cannot be read afterwards", async () => {
		let reads = 0;
		const robot: FeedbackRobot = { getElementsOnScreen: async () => {
			if (reads++ > 0) {
				throw new Error("screen is locked");
			}

			return form;
		} };

		const text = await runWithFeedback(robot, { kind: "none" }, async () => "Pressed the button: LOCK", DEFAULT_FEEDBACK_SETTINGS, fakeClock());

		expect(text).toBe("Pressed the button: LOCK\nScreen: could not be read after the action (screen is locked)");
	});

	test("propagates a failing action unchanged", async () => {
		const robot = robotWith([form]);
		await expect(runWithFeedback(robot, { kind: "none" }, async () => {
			throw new Error("tap failed");
		}, DEFAULT_FEEDBACK_SETTINGS, fakeClock())).rejects.toThrow("tap failed");
	});
});

test.describe("feedbackSettingsFromEnv", () => {

	test("is on by default with a 2s settle timeout", () => {
		expect(feedbackSettingsFromEnv({})).toEqual(DEFAULT_FEEDBACK_SETTINGS);
	});

	test("MOBILEMCP_ACTION_FEEDBACK=0 turns it off and MOBILEMCP_SETTLE_TIMEOUT_MS sets the timeout", () => {
		const settings = feedbackSettingsFromEnv({ MOBILEMCP_ACTION_FEEDBACK: "0", MOBILEMCP_SETTLE_TIMEOUT_MS: "3500" });
		expect(settings.enabled).toBe(false);
		expect(settings.timeoutMs).toBe(3500);
	});

	test("ignores an invalid timeout", () => {
		expect(feedbackSettingsFromEnv({ MOBILEMCP_SETTLE_TIMEOUT_MS: "soon" }).timeoutMs).toBe(DEFAULT_FEEDBACK_SETTINGS.timeoutMs);
	});
});

test("every action tool can turn the feedback off", async () => {
	process.env.MOBILEMCP_DISABLE_TELEMETRY = "1";
	const server = createMcpServer();
	const client = new Client({ name: "action-feedback-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	const { tools } = await client.listTools();

	const actionTools = [
		"mobile_click_on_screen_at_coordinates",
		"mobile_double_tap_on_screen",
		"mobile_long_press_on_screen_at_coordinates",
		"mobile_swipe_on_screen",
		"mobile_type_keys",
		"mobile_press_button",
		"mobile_open_url",
		"mobile_launch_app",
	];

	for (const name of actionTools) {
		const tool: any = tools.find(candidate => candidate.name === name);
		expect(tool.inputSchema.properties.feedback, name).toBeDefined();
		expect(tool.inputSchema.required ?? [], name).not.toContain("feedback");
	}
});
